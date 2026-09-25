import { createHash, timingSafeEqual } from "node:crypto";
import { getPool } from "./db";
import { filterLogs } from "./telemetry-logs.mjs";
import { filterMetrics } from "./telemetry-metrics.mjs";

const digest = (text: string) => createHash("sha256").update(text).digest();

// Local pilot only. Production needs device credentials and an approved collection policy.
export async function receiveTelemetry(
  request: Request,
  signal: "logs" | "metrics",
) {
  if (process.env.NODE_ENV !== "development")
    return new Response(null, { status: 404 });
  const token = process.env.TELEMETRY_INGEST_TOKEN;
  if (!token || token.length < 32) return new Response(null, { status: 503 });
  const authorization = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(digest(authorization), digest(`Bearer ${token}`))) {
    return new Response(null, { status: 401 });
  }
  if (
    request.headers.get("content-type")?.split(";")[0] !== "application/json" ||
    request.headers.has("content-encoding")
  ) {
    return new Response(null, { status: 415 });
  }
  // Bound the stream before parsing, without logging raw client data.
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  let rows;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4 * 1024 * 1024) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(value);
    }
    const packet = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const device = digest(token).toString("hex");
    rows =
      signal === "logs"
        ? filterLogs(packet, device)
        : filterMetrics(packet, device);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!rows.length) return Response.json({});
  // Each batch is atomic. Exporter retries cannot add duplicate events or counters.
  let client;
  try {
    client = await getPool().connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '3s'");
    for (const row of rows) {
      if ("kind" in row) {
        await client.query(
          "INSERT INTO telemetry_events(event_id,kind,occurred_at,plugin,skill) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
          [row.id, row.kind, row.occurredAt, row.plugin, row.skill],
        );
      } else {
        await client.query(
          "INSERT INTO telemetry_skill_metrics(stream_id,value,temporality,skill,invoke_type) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(stream_id) DO UPDATE SET value=GREATEST(telemetry_skill_metrics.value,EXCLUDED.value)",
          [row.id, row.value, row.temporality, row.skill, row.invokeType],
        );
      }
    }
    await client.query("COMMIT");
    return Response.json({});
  } catch {
    if (client) await client.query("ROLLBACK").catch(() => {});
    return new Response(null, { status: 503 });
  } finally {
    client?.release();
  }
}
