import "server-only";
import { randomUUID } from "node:crypto";
import { getPool } from "./db";
import { bearerHash } from "./telemetry-auth";
import { readBoundedChunks } from "./telemetry-body";
import { usageCollectionEnabled } from "./collection-scope";

const headers = { "cache-control": "no-store" };
const response = (status: number) => new Response(null, { status, headers });
export function telemetryEnrollmentMode(): "consent" | "github" | undefined {
  const mode = process.env.TELEMETRY_ENROLLMENT_MODE ?? "github";
  return mode === "consent" || mode === "github" ? mode : undefined;
}
const enabled = () =>
  process.env.TELEMETRY_ENABLED === "1" && usageCollectionEnabled();

export function enrollmentGet() {
  if (!enabled()) return response(404);
  const mode = telemetryEnrollmentMode();
  return mode ? Response.json({ mode }, { headers }) : response(503);
}

// The CLI asks for consent before this call. A bearer identifies an installation,
// not a person or company member. A retry keeps its UUID and count identities.
export async function enrollmentPost(request: Request) {
  if (!enabled() || telemetryEnrollmentMode() !== "consent")
    return response(404);
  if (request.headers.has("origin")) return response(403);
  const hash = bearerHash(request);
  if (!hash) return response(401);
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json" ||
    request.headers.has("content-encoding")
  )
    return response(415);
  const reader = request.body?.getReader();
  if (!reader) return response(400);
  let renew = false;
  try {
    const chunks = await readBoundedChunks(reader, 1024);
    if (chunks === null) return response(413);
    const consent = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (
      !consent ||
      !["consent", "consent,renew"].includes(
        Object.keys(consent).sort().join(","),
      ) ||
      consent.consent !== true ||
      (Object.hasOwn(consent, "renew") && consent.renew !== true)
    )
      return response(400);
    renew = consent.renew === true;
  } catch {
    return response(400);
  } finally {
    reader.releaseLock();
  }
  let client;
  try {
    client = await getPool().connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '3s'");
    // Serialize new registrations across server instances. Repeated requests
    // for an existing device do not consume the issuance allowance.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('telemetry-consent-enrollment'))",
    );
    const existing = await client.query(
      "SELECT device_id,identity_kind,revoked_at FROM telemetry_devices WHERE token_hash=$1 FOR UPDATE",
      [hash],
    );
    const device = existing.rows[0];
    if (
      (renew && !device) ||
      (device && (device.identity_kind !== "consent" || device.revoked_at))
    ) {
      await client.query("ROLLBACK");
      return response(401);
    }
    let saved;
    if (device) {
      saved = await client.query(
        "UPDATE telemetry_devices SET expires_at=now()+interval '12 hours' WHERE device_id=$1 RETURNING device_id,expires_at",
        [device.device_id],
      );
    } else {
      const recent = await client.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM telemetry_devices WHERE identity_kind='consent' AND created_at>now()-interval '1 minute'",
      );
      if (recent.rows[0].count >= 60) {
        await client.query("ROLLBACK");
        return new Response(null, {
          status: 429,
          headers: { ...headers, "retry-after": "60" },
        });
      }
      saved = await client.query(
        "INSERT INTO telemetry_devices(device_id,user_id,token_hash,expires_at,identity_kind) VALUES($1,NULL,$2,now()+interval '12 hours','consent') RETURNING device_id,expires_at",
        [randomUUID(), hash],
      );
    }
    await client.query("COMMIT");
    return Response.json({ ...saved.rows[0], mode: "consent" }, { headers });
  } catch {
    if (client) await client.query("ROLLBACK").catch(() => {});
    console.error("Telemetry request failed.", {
      operation: "enrollment",
      stage: "storage",
      status: 503,
    });
    return response(503);
  } finally {
    client?.release();
  }
}
