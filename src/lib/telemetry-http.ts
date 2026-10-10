import { getPool } from "./db";
import { usageCollectionEnabled } from "./collection-scope";
import { bearerHash, revokeCredentials, tokenHash } from "./telemetry-auth";
import { parseBatch } from "./telemetry-events";
import { readBoundedChunks } from "./telemetry-body";
import { telemetryEnrollmentMode } from "./telemetry-enrollment";

const privateHeaders = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};
class HttpError extends Error {
  constructor(public status: number) {
    super("Telemetry request rejected");
  }
}
const empty = (status: number) =>
  new Response(null, { status, headers: privateHeaders });
const enabled = () =>
  process.env.TELEMETRY_ENABLED === "1" && usageCollectionEnabled();
async function bodyText(request: Request, type: string, limit: number) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
      type ||
    request.headers.has("content-encoding")
  )
    throw new HttpError(415);
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400);
  let chunks: Uint8Array[] | null;
  try {
    chunks = await readBoundedChunks(reader, limit);
    if (chunks === null) throw new HttpError(413);
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function json(
  request: Request,
  limit: number,
): Promise<Record<string, unknown>> {
  const text = await bodyText(request, "application/json", limit);
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error();
    return value;
  } catch {
    throw new HttpError(400);
  }
}
type FailureStage = "request" | "storage";
function failure(
  error: unknown,
  operation: "revoke" | "ingest",
  stage: FailureStage,
) {
  const status = error instanceof HttpError ? error.status : 503;
  // Errors can contain credentials, SQL values or provider response bodies.
  // Log only fixed operation/stage labels; rejected client input is not an outage.
  if (status >= 500)
    console.error("Telemetry request failed.", { operation, stage, status });
  return empty(status);
}
export async function revokeDevice(request: Request) {
  if (!enabled()) return empty(404);
  const hash = bearerHash(request);
  if (!hash) return empty(401);
  try {
    return empty((await revokeCredentials(getPool(), hash)) ? 204 : 401);
  } catch (error) {
    return failure(error, "revoke", "storage");
  }
}
export async function receiveEvents(request: Request) {
  if (!enabled()) return empty(404);
  const hash = bearerHash(request);
  if (!hash) return empty(401);
  let client;
  let stage: FailureStage = "storage";
  try {
    const pool = getPool();
    const auth = await pool.query(
      "SELECT device_id FROM telemetry_devices WHERE token_hash=$1 AND identity_kind='consent' AND revoked_at IS NULL AND expires_at > now()",
      [hash],
    );
    if (!auth.rows.length) return empty(401);
    stage = "request";
    const packet = await json(request, 256 * 1024);
    let batch;
    try {
      batch = parseBatch(packet);
    } catch {
      throw new HttpError(400);
    }
    if (telemetryEnrollmentMode() !== "consent") return empty(401);
    stage = "storage";
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '3s'");
    // Keep historical company devices rejected and serialize quota/revocation with the batch.
    const { rows } = await client.query(
      "SELECT device_id FROM telemetry_devices WHERE token_hash=$1 AND identity_kind='consent' AND revoked_at IS NULL AND expires_at > now() FOR UPDATE",
      [hash],
    );
    if (!rows.length) throw new HttpError(401);
    const device = rows[0].device_id;
    // Bound anonymous-device traffic without retaining IP addresses. The
    // existing device lock makes the allowance consistent across instances.
    const allowance = await client.query(
      "UPDATE telemetry_devices SET window_started_at=CASE WHEN window_started_at<=now()-interval '1 minute' THEN now() ELSE window_started_at END,window_records=CASE WHEN window_started_at<=now()-interval '1 minute' THEN $2 ELSE window_records+$2 END WHERE device_id=$1 AND (CASE WHEN window_started_at<=now()-interval '1 minute' THEN 0 ELSE window_records END)+$2<=5000 RETURNING device_id",
      [device, Math.max(1, batch.events.length + batch.metrics.length)],
    );
    if (!allowance.rows.length) throw new HttpError(429);

    // A bulk upsert cannot update the same conflict row twice. Preserve the
    // first record's metadata and the largest counter, as sequential writes did.
    const events = new Map<string, (typeof batch.events)[number]>();
    for (const event of batch.events)
      if (!events.has(event.id)) events.set(event.id, event);
    const metrics = new Map<string, (typeof batch.metrics)[number]>();
    for (const metric of batch.metrics) {
      const first = metrics.get(metric.id);
      if (first) first.value = Math.max(first.value, metric.value);
      else metrics.set(metric.id, { ...metric });
    }
    const placeholders = (count: number, columns: number) =>
      Array.from(
        { length: count },
        (_, row) =>
          `(${Array.from({ length: columns }, (_, column) => `$${row * columns + column + 1}`).join(",")})`,
      ).join(",");
    // At most two write round trips while the device lock is held, even for a
    // full 1,000-record batch. Every value remains a bound SQL parameter.
    if (events.size)
      await client.query(
        `INSERT INTO telemetry_events(event_id,kind,occurred_at,plugin,skill,client,source,device_id,identity_kind) VALUES${placeholders(events.size, 9)} ON CONFLICT DO NOTHING`,
        [...events.values()].flatMap((e) => [
          tokenHash(JSON.stringify([device, e.id])),
          e.kind,
          e.occurredAt,
          e.plugin,
          e.skill,
          e.client,
          e.source,
          device,
          "consent",
        ]),
      );
    if (metrics.size)
      await client.query(
        `INSERT INTO telemetry_skill_metrics(stream_id,value,temporality,skill,invoke_type,plugin,device_id,identity_kind) VALUES${placeholders(metrics.size, 8)} ON CONFLICT(stream_id) DO UPDATE SET value=GREATEST(telemetry_skill_metrics.value,EXCLUDED.value)`,
        [...metrics.values()].flatMap((m) => [
          tokenHash(JSON.stringify([device, m.id])),
          m.value,
          m.temporality,
          m.skill,
          m.invokeType,
          m.plugin,
          device,
          "consent",
        ]),
      );
    await client.query("COMMIT");
    return Response.json({}, { headers: privateHeaders });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    return failure(error, "ingest", stage);
  } finally {
    client?.release();
  }
}
