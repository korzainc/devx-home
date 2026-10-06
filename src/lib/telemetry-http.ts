import { getAuth } from "./auth";
import { getPool } from "./db";
import { usageCollectionEnabled } from "./collection-scope";
import { isOrgMember } from "./membership";
import {
  bearerHash,
  DeviceOwnershipError,
  connectParams,
  consentToken,
  exchangeCode,
  issueCode,
  revokeCredentials,
  tokenHash,
  verifyConsent,
  type ConnectParams,
} from "./telemetry-auth";
import { parseBatch } from "./telemetry-events";
import { telemetryEnrollmentMode } from "./telemetry-enrollment";
import {
  telemetryMembership,
  TELEMETRY_MEMBERSHIP_SELECT,
  type TelemetryMembership,
} from "./telemetry-membership";

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
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function html(body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Korza monitoring</title><style>body{font:18px system-ui;line-height:1.6;max-width:42rem;margin:4rem auto;padding:0 1.5rem;color:#15212b}button{font:inherit;padding:.6rem 1rem;margin:.4rem .6rem .4rem 0;cursor:pointer}code{overflow-wrap:anywhere}</style></head><body>${body}</body></html>`,
    {
      status,
      headers: {
        ...privateHeaders,
        "referrer-policy": "same-origin",
        "content-type": "text/html; charset=utf-8",
        "content-security-policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' http://127.0.0.1:*; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}
async function bodyText(request: Request, type: string, limit: number) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
      type ||
    request.headers.has("content-encoding")
  )
    throw new HttpError(415);
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new HttpError(413);
      }
      chunks.push(value);
    }
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
function fields(params: URLSearchParams) {
  const result: Record<string, string> = {};
  for (const [key, value] of params) {
    if (Object.hasOwn(result, key)) throw new HttpError(400);
    result[key] = value;
  }
  return result;
}
async function browserSession(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) throw new HttpError(401);
  return session;
}
function requireOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new HttpError(403);
}
function secret() {
  const key = process.env.BETTER_AUTH_SECRET;
  if (!key) throw new HttpError(503);
  return key;
}
function redirectCallback(params: ConnectParams, name: string, value: string) {
  const callback = new URL(params.redirect_uri);
  callback.searchParams.set("state", params.state);
  callback.searchParams.set(name, value);
  return new Response(null, {
    status: 303,
    headers: { ...privateHeaders, location: callback.toString() },
  });
}
type FailureStage = "request" | "session" | "membership" | "storage";
function failure(
  error: unknown,
  operation:
    | "connect"
    | "consent"
    | "exchange"
    | "revoke"
    | "ingest"
    | "devices"
    | "device-revoke",
  stage: FailureStage,
) {
  const status =
    error instanceof DeviceOwnershipError
      ? 403
      : error instanceof HttpError
        ? error.status
        : 503;
  // Errors can contain credentials, SQL values or provider response bodies.
  // Log only fixed operation/stage labels; rejected client input is not an outage.
  if (status >= 500)
    console.error("Telemetry request failed.", { operation, stage, status });
  return empty(status);
}
export async function connectGet(request: Request) {
  if (!enabled()) return empty(404);
  let stage: FailureStage = "request";
  try {
    let params: ConnectParams;
    try {
      const input = fields(new URL(request.url).searchParams);
      if (
        ![
          "code_challenge,code_challenge_method,redirect_uri,state",
          "code_challenge,code_challenge_method,device_id,redirect_uri,state",
        ].includes(Object.keys(input).sort().join(",")) ||
        input.code_challenge_method !== "S256"
      )
        throw Error();
      params = connectParams(input);
    } catch {
      throw new HttpError(400);
    }
    stage = "session";
    const session = await browserSession(request);
    const csrf = consentToken(params, session.session.id, secret());
    const hidden = Object.entries({ ...params, csrf })
      .map(
        ([key, value]) =>
          `<input type="hidden" name="${key}" value="${escape(value)}">`,
      )
      .join("");
    return html(
      `<h1>Connect Korza monitoring</h1><p>Allow this CLI device to send Korza plugin installation and skill usage counts from Claude Code and supported Codex events to DevX Home.</p><p>Prompts, tool arguments, email, file paths and raw resource attributes are excluded. Counts are associated with this device and your signed-in account. Recorded installs are combined per client. Optional terminal tracking covers supported Claude Code and Codex install commands; Codex's /plugins menu is not recorded.</p><p>Authorization expires within 12 hours. You can stop collection with the CLI disable command or revoke this device from <a href="/telemetry/devices">connected devices</a>.</p><p>Only allow if you just started setup in your terminal. The result returns to <code>${escape(params.redirect_uri)}</code>.</p><form method="post" action="/telemetry/connect">${hidden}<button name="decision" value="allow">Allow monitoring</button><button name="decision" value="deny">Deny</button></form>`,
    );
  } catch (error) {
    return failure(error, "connect", stage);
  }
}
export async function connectPost(request: Request) {
  if (!enabled()) return empty(404);
  let stage: FailureStage = "request";
  let verifiedCallback: ConnectParams | undefined;
  try {
    requireOrigin(request);
    stage = "session";
    const session = await browserSession(request);
    stage = "request";
    const input = fields(
      new URLSearchParams(
        await bodyText(request, "application/x-www-form-urlencoded", 8192),
      ),
    );
    let params: ConnectParams;
    try {
      params = connectParams(input);
    } catch {
      throw new HttpError(400);
    }
    if (
      ![
        "code_challenge,csrf,decision,redirect_uri,state",
        "code_challenge,csrf,decision,device_id,redirect_uri,state",
      ].includes(Object.keys(input).sort().join(","))
    )
      throw new HttpError(400);
    if (!verifyConsent(input.csrf, params, session.session.id, secret()))
      throw new HttpError(403);
    if (input.decision === "deny")
      return redirectCallback(params, "error", "access_denied");
    if (input.decision !== "allow") throw new HttpError(400);
    // Only a session-bound, same-origin consent form may complete the CLI callback.
    verifiedCallback = params;
    // A portal cache hit or outage fallback is insufficient to mint a new device credential.
    stage = "membership";
    if (
      !(await isOrgMember(request.headers, session.user, {
        fresh: true,
        throwOnError: true,
      }))
    )
      return redirectCallback(params, "error", "access_denied");
    stage = "storage";
    return redirectCallback(
      params,
      "code",
      await issueCode(getPool(), session.user.id, params),
    );
  } catch (error) {
    const response = failure(error, "consent", stage);
    return verifiedCallback
      ? redirectCallback(
          verifiedCallback,
          "error",
          response.status >= 500 ? "temporarily_unavailable" : "access_denied",
        )
      : response;
  }
}
export async function exchangePost(request: Request) {
  if (!enabled()) return empty(404);
  let stage: FailureStage = "request";
  try {
    const input = await json(request, 8192);
    stage = "storage";
    const result = await exchangeCode(getPool(), input);
    return result
      ? Response.json(result, { headers: privateHeaders })
      : empty(400);
  } catch (error) {
    return failure(error, "exchange", stage);
  }
}
export async function revokeDevice(request: Request) {
  if (!enabled()) return empty(404);
  const hash = bearerHash(request);
  if (!hash) return empty(401);
  try {
    return empty(
      (await revokeCredentials(getPool(), { tokenHash: hash })) ? 204 : 401,
    );
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
      "SELECT device_id,user_id,identity_kind FROM telemetry_devices WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()",
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
    const userId = auth.rows[0].user_id;
    const consentOnly = auth.rows[0].identity_kind === "consent";
    if (consentOnly && telemetryEnrollmentMode() !== "consent")
      return empty(401);
    stage = "membership";
    if (!consentOnly && !(await telemetryMembership(userId))) return empty(401);
    stage = "storage";
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '3s'");
    // Always lock user before device. A removal committed before this lock
    // denies the batch; one racing ingestion waits until the whole batch ends.
    let membershipFresh = true;
    if (!consentOnly) {
      const membership = await client.query<TelemetryMembership>(
        `${TELEMETRY_MEMBERSHIP_SELECT} FOR SHARE`,
        [userId],
      );
      if (!membership.rows[0]?.orgMember) throw new HttpError(401);
      membershipFresh = membership.rows[0].fresh;
    }
    // Hold a shared row lock through ingestion. Revocation cannot race a partly committed batch.
    const { rows } = await client.query(
      consentOnly
        ? "SELECT device_id FROM telemetry_devices WHERE token_hash=$1 AND user_id IS NULL AND identity_kind='consent' AND revoked_at IS NULL AND expires_at > now() FOR UPDATE"
        : "SELECT device_id FROM telemetry_devices WHERE token_hash=$1 AND user_id=$2 AND identity_kind='github' AND revoked_at IS NULL AND expires_at > now() FOR SHARE",
      consentOnly ? [hash] : [hash, userId],
    );
    if (!rows.length) throw new HttpError(401);
    // Keep revocation authoritative if the cache also aged during lock waits.
    if (!membershipFresh) throw new HttpError(503);
    const device = rows[0].device_id;
    if (consentOnly) {
      // Bound anonymous-device traffic without retaining IP addresses. The
      // existing device lock makes the allowance consistent across instances.
      const allowance = await client.query(
        "UPDATE telemetry_devices SET window_started_at=CASE WHEN window_started_at<=now()-interval '1 minute' THEN now() ELSE window_started_at END,window_records=CASE WHEN window_started_at<=now()-interval '1 minute' THEN $2 ELSE window_records+$2 END WHERE device_id=$1 AND (CASE WHEN window_started_at<=now()-interval '1 minute' THEN 0 ELSE window_records END)+$2<=5000 RETURNING device_id",
        [device, Math.max(1, batch.events.length + batch.metrics.length)],
      );
      if (!allowance.rows.length) throw new HttpError(429);
    }
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
          consentOnly ? "consent" : "github",
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
          consentOnly ? "consent" : "github",
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
const revokeParams = (device: string): ConnectParams => ({
  redirect_uri: "revoke",
  state: device,
  code_challenge: "",
});
export async function devicesGet(request: Request) {
  if (!enabled()) return empty(404);
  let stage: FailureStage = "session";
  try {
    const session = await browserSession(request);
    stage = "request";
    const params = new URL(request.url).searchParams;
    const before = params.get("before");
    if (
      [...params.keys()].some((key) => key !== "before") ||
      params.getAll("before").length > 1 ||
      (before !== null &&
        !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(before))
    )
      throw new HttpError(400);
    stage = "storage";
    const { rows } = await getPool().query(
      // The cursor resolves inside the same owner scope and retains PostgreSQL's timestamp
      // precision. Renewed older devices remain reachable even after 100 newer enrollments.
      "SELECT device_id,created_at,expires_at,revoked_at FROM telemetry_devices WHERE user_id=$1 AND ($2::uuid IS NULL OR (created_at,device_id) < (SELECT created_at,device_id FROM telemetry_devices WHERE device_id=$2 AND user_id=$1)) ORDER BY created_at DESC,device_id DESC LIMIT 101",
      [session.user.id, before],
    );
    const page = rows.slice(0, 100);
    const items = page
      .map((row) => {
        const id = String(row.device_id);
        const active =
          !row.revoked_at && new Date(row.expires_at).getTime() > Date.now();
        return `<li><code>${escape(id)}</code><br>Expires ${escape(new Date(row.expires_at).toISOString())}${active ? `<form method="post" action="/telemetry/devices"><input type="hidden" name="device_id" value="${escape(id)}"><input type="hidden" name="csrf" value="${consentToken(revokeParams(id), session.session.id, secret())}"><button>Revoke device</button></form>` : `<p>${row.revoked_at ? "Revoked" : "Expired"}</p>`}</li>`;
      })
      .join("");
    const navigation =
      before !== null || rows.length > 100
        ? `<nav aria-label="Device history">${before !== null ? '<a href="/telemetry/devices">Newest devices</a>' : ""}${rows.length > 100 ? `<a href="/telemetry/devices?before=${encodeURIComponent(String(page[page.length - 1].device_id))}">Older devices</a>` : ""}</nav>`
        : "";
    return html(
      `<h1>Connected monitoring devices</h1><p>Revocation stops this device from sending new counts. To stop the local collector and remove agent configuration, also run the CLI disable command.</p>${items ? `<ul>${items}</ul>` : "<p>No devices on this page.</p>"}${navigation}`,
    );
  } catch (error) {
    return failure(error, "devices", stage);
  }
}
export async function devicesPost(request: Request) {
  if (!enabled()) return empty(404);
  let stage: FailureStage = "request";
  try {
    requireOrigin(request);
    stage = "session";
    const session = await browserSession(request);
    stage = "request";
    const input = fields(
      new URLSearchParams(
        await bodyText(request, "application/x-www-form-urlencoded", 4096),
      ),
    );
    if (
      Object.keys(input).sort().join(",") !== "csrf,device_id" ||
      !/^[a-f0-9-]{36}$/.test(input.device_id)
    )
      throw new HttpError(400);
    if (
      !verifyConsent(
        input.csrf,
        revokeParams(input.device_id),
        session.session.id,
        secret(),
      )
    )
      return html(
        '<h1>This form expired or could not be verified</h1><p>No device was revoked. <a href="/telemetry/devices">Reload connected devices</a>, then choose Revoke device again.</p>',
        403,
      );
    stage = "storage";
    await revokeCredentials(getPool(), {
      deviceId: input.device_id,
      userId: session.user.id,
    });
    return new Response(null, {
      status: 303,
      headers: { ...privateHeaders, location: "/telemetry/devices" },
    });
  } catch (error) {
    return failure(error, "device-revoke", stage);
  }
}
