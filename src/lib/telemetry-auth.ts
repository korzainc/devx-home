import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

export type Queryable = {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
};
export type TransactionPool = {
  connect(): Promise<Queryable & { release(): void }>;
};
export type ConnectParams = {
  redirect_uri: string;
  state: string;
  code_challenge: string;
  device_id?: string;
};
export class DeviceOwnershipError extends Error {
  constructor() {
    super("Device does not belong to this user");
  }
}
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const pkceChallenge = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
export function validCallback(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/callback$/.test(value)
  )
    return false;
  const port = Number(value.split(":")[2].split("/")[0]);
  return port <= 65535;
}
export function connectParams(input: Record<string, unknown>): ConnectParams {
  if (
    !validCallback(input.redirect_uri) ||
    typeof input.state !== "string" ||
    !/^[A-Za-z0-9_-]{32,128}$/.test(input.state) ||
    typeof input.code_challenge !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(input.code_challenge) ||
    (input.device_id !== undefined &&
      (typeof input.device_id !== "string" ||
        !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(input.device_id)))
  )
    throw Error("Invalid connection request");
  return {
    redirect_uri: input.redirect_uri,
    state: input.state,
    code_challenge: input.code_challenge,
    ...(input.device_id !== undefined
      ? { device_id: input.device_id as string }
      : {}),
  };
}
function signature(
  params: ConnectParams,
  sessionId: string,
  secret: string,
  expires: string,
) {
  return createHmac("sha256", secret)
    .update(
      JSON.stringify([
        "telemetry-consent-v1",
        sessionId,
        params.redirect_uri,
        params.state,
        params.code_challenge,
        params.device_id ?? null,
        expires,
      ]),
    )
    .digest("hex");
}
export function consentToken(
  params: ConnectParams,
  sessionId: string,
  secret: string,
  now = Date.now(),
) {
  const expires = String(now + 600000);
  return `${expires}.${signature(params, sessionId, secret, expires)}`;
}
export function verifyConsent(
  token: unknown,
  params: ConnectParams,
  sessionId: string,
  secret: string,
  now = Date.now(),
) {
  if (typeof token !== "string" || !/^[0-9]{1,16}\.[a-f0-9]{64}$/.test(token))
    return false;
  const [expires, sig] = token.split(".");
  if (Number(expires) <= now || Number(expires) > now + 600000) return false;
  return timingSafeEqual(
    Buffer.from(sig, "hex"),
    Buffer.from(signature(params, sessionId, secret, expires), "hex"),
  );
}
export async function issueCode(
  pool: TransactionPool,
  userId: string,
  params: ConnectParams,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '3s'");
    if (params.device_id) {
      const { rows } = await client.query(
        "SELECT device_id FROM telemetry_devices WHERE device_id=$1 AND user_id=$2 FOR UPDATE",
        [params.device_id, userId],
      );
      if (!rows.length) throw new DeviceOwnershipError();
    }
    // Hold the device lock through issuance so a concurrent revocation also invalidates this
    // grant. Always lock the device before its codes, as exchange and revocation do.
    // The expiry index bounds cleanup; locked grants are left for a later request.
    await client.query(
      "DELETE FROM telemetry_codes WHERE code_hash IN (SELECT code_hash FROM telemetry_codes WHERE expires_at <= now() ORDER BY expires_at LIMIT 1000 FOR UPDATE SKIP LOCKED)",
    );
    const code = randomBytes(32).toString("base64url");
    await client.query(
      "INSERT INTO telemetry_codes(code_hash,user_id,code_challenge,redirect_uri,device_id,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '60 seconds')",
      [
        tokenHash(code),
        userId,
        params.code_challenge,
        params.redirect_uri,
        params.device_id ?? null,
      ],
    );
    await client.query("COMMIT");
    return code;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
export async function exchangeCode(
  pool: TransactionPool,
  input: Record<string, unknown>,
) {
  if (
    Object.keys(input).sort().join(",") !== "code,code_verifier,redirect_uri" ||
    typeof input.code !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(input.code) ||
    typeof input.code_verifier !== "string" ||
    !/^[A-Za-z0-9._~-]{43,128}$/.test(input.code_verifier) ||
    !validCallback(input.redirect_uri)
  )
    return null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '3s'");
    const binding = [
      tokenHash(input.code),
      pkceChallenge(input.code_verifier),
      input.redirect_uri,
    ];
    const grant = await client.query(
      "SELECT user_id,device_id FROM telemetry_codes WHERE code_hash=$1 AND code_challenge=$2 AND redirect_uri=$3 AND expires_at > now()",
      binding,
    );
    if (!grant.rows.length) {
      await client.query("ROLLBACK");
      return null;
    }
    if (grant.rows[0].device_id) {
      const device = await client.query(
        "SELECT device_id FROM telemetry_devices WHERE device_id=$1 AND user_id=$2 FOR UPDATE",
        [grant.rows[0].device_id, grant.rows[0].user_id],
      );
      if (!device.rows.length) throw new DeviceOwnershipError();
    }
    // Revocation may have removed this grant while we waited for the device lock. Recheck it
    // with a fresh statement snapshot, and never consume the code before locking its device.
    // A matching DELETE makes replay and concurrent exchange impossible; rollback retains the
    // grant if credential creation fails. Wrong PKCE or callback cannot consume someone else's code.
    const { rows } = await client.query(
      "DELETE FROM telemetry_codes WHERE code_hash=$1 AND code_challenge=$2 AND redirect_uri=$3 AND expires_at > now() RETURNING user_id,device_id",
      binding,
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      return null;
    }
    const token = `korza_${randomBytes(32).toString("base64url")}`;
    const device_id =
      typeof rows[0].device_id === "string" ? rows[0].device_id : randomUUID();
    const expires_at = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    if (rows[0].device_id) {
      const updated = await client.query(
        "UPDATE telemetry_devices SET token_hash=$2,expires_at=$3,revoked_at=NULL WHERE device_id=$1 AND user_id=$4 RETURNING device_id",
        [device_id, tokenHash(token), expires_at, rows[0].user_id],
      );
      if (!updated.rows.length) throw new DeviceOwnershipError();
    } else {
      await client.query(
        "INSERT INTO telemetry_devices(device_id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)",
        [device_id, rows[0].user_id, tokenHash(token), expires_at],
      );
    }
    await client.query("COMMIT");
    return { token, device_id, expires_at };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
export async function revokeCredentials(
  pool: TransactionPool,
  identity: { tokenHash: string } | { deviceId: string; userId: string },
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '3s'");
    const { rows } = await client.query(
      "tokenHash" in identity
        ? "SELECT device_id FROM telemetry_devices WHERE token_hash=$1 FOR UPDATE"
        : "SELECT device_id FROM telemetry_devices WHERE device_id=$1 AND user_id=$2 FOR UPDATE",
      "tokenHash" in identity
        ? [identity.tokenHash]
        : [identity.deviceId, identity.userId],
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query(
      "UPDATE telemetry_devices SET revoked_at = COALESCE(revoked_at, now()) WHERE device_id=$1",
      [rows[0].device_id],
    );
    // This statement starts after the device lock is acquired, so it also sees grants issued
    // while revocation waited. Keep history and token identity for idempotent self-revocation.
    await client.query("DELETE FROM telemetry_codes WHERE device_id=$1", [
      rows[0].device_id,
    ]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
export function bearerHash(request: Request) {
  const bearer = request.headers.get("authorization");
  return bearer && /^Bearer korza_[A-Za-z0-9_-]{43}$/.test(bearer)
    ? tokenHash(bearer.slice(7))
    : null;
}
