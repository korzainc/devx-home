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
  db: Queryable,
  userId: string,
  params: ConnectParams,
) {
  if (params.device_id) {
    const { rows } = await db.query(
      "SELECT device_id FROM telemetry_devices WHERE device_id=$1 AND user_id=$2",
      [params.device_id, userId],
    );
    if (!rows.length) throw new DeviceOwnershipError();
  }
  // The expiry index keeps this bounded cleanup cheap; locked grants are left for a later
  // request. Device history remains intact because aggregate counts reference those rows.
  await db.query(
    "DELETE FROM telemetry_codes WHERE code_hash IN (SELECT code_hash FROM telemetry_codes WHERE expires_at <= now() ORDER BY expires_at LIMIT 1000 FOR UPDATE SKIP LOCKED)",
  );
  const code = randomBytes(32).toString("base64url");
  await db.query(
    "INSERT INTO telemetry_codes(code_hash,user_id,code_challenge,redirect_uri,device_id,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '60 seconds')",
    [
      tokenHash(code),
      userId,
      params.code_challenge,
      params.redirect_uri,
      params.device_id ?? null,
    ],
  );
  return code;
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
    // A matching DELETE makes replay and concurrent exchange impossible; rollback retains the
    // grant if credential creation fails. Wrong PKCE or callback cannot consume someone else's code.
    const { rows } = await client.query(
      "DELETE FROM telemetry_codes WHERE code_hash=$1 AND code_challenge=$2 AND redirect_uri=$3 AND expires_at > now() RETURNING user_id,device_id",
      [
        tokenHash(input.code),
        pkceChallenge(input.code_verifier),
        input.redirect_uri,
      ],
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
export function bearerHash(request: Request) {
  const bearer = request.headers.get("authorization");
  return bearer && /^Bearer korza_[A-Za-z0-9_-]{43}$/.test(bearer)
    ? tokenHash(bearer.slice(7))
    : null;
}
