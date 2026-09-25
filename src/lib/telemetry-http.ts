import { getAuth } from "./auth";
import { getPool } from "./db";
import { isOrgMember } from "./membership";
import {
  bearerHash,
  DeviceOwnershipError,
  connectParams,
  consentToken,
  exchangeCode,
  issueCode,
  tokenHash,
  verifyConsent,
  type ConnectParams,
} from "./telemetry-auth";
import { parseBatch } from "./telemetry-events";

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
const enabled = () => process.env.TELEMETRY_ENABLED === "1";
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function html(body: string) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Korza monitoring</title><style>body{font:18px system-ui;line-height:1.6;max-width:42rem;margin:4rem auto;padding:0 1.5rem;color:#15212b}button{font:inherit;padding:.6rem 1rem;margin:.4rem .6rem .4rem 0;cursor:pointer}code{overflow-wrap:anywhere}</style></head><body>${body}</body></html>`,
    {
      headers: {
        ...privateHeaders,
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
function failure(error: unknown) {
  return empty(
    error instanceof DeviceOwnershipError
      ? 403
      : error instanceof HttpError
        ? error.status
        : 503,
  );
}
export async function connectGet(request: Request) {
  if (!enabled()) return empty(404);
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
    const session = await browserSession(request);
    const csrf = consentToken(params, session.session.id, secret());
    const hidden = Object.entries({ ...params, csrf })
      .map(
        ([key, value]) =>
          `<input type="hidden" name="${key}" value="${escape(value)}">`,
      )
      .join("");
    return html(
      `<h1>Connect Korza monitoring</h1><p>Allow this CLI device to send Korza plugin installation and skill usage counts from Claude Code and supported Codex events to DevX Home.</p><p>Prompts, tool arguments, email, file paths and raw resource attributes are excluded. Counts are associated with this device and your signed-in account. Installs verified through Korza CLI are shown separately from Claude Code reports, since those counts may overlap. Native Codex installations are not included.</p><p>Authorization expires within 12 hours. You can stop collection with the CLI disable command or revoke this device from <a href="/telemetry/devices">connected devices</a>.</p><p>Only allow if you just started setup in your terminal. The result returns to <code>${escape(params.redirect_uri)}</code>.</p><form method="post" action="/telemetry/connect">${hidden}<button name="decision" value="allow">Allow monitoring</button><button name="decision" value="deny">Deny</button></form>`,
    );
  } catch (error) {
    return failure(error);
  }
}
export async function connectPost(request: Request) {
  if (!enabled()) return empty(404);
  try {
    requireOrigin(request);
    const session = await browserSession(request);
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
    // A portal cache hit or outage fallback is insufficient to mint a new device credential.
    if (!(await isOrgMember(request.headers, session.user, { fresh: true })))
      throw new HttpError(403);
    return redirectCallback(
      params,
      "code",
      await issueCode(getPool(), session.user.id, params),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function exchangePost(request: Request) {
  if (!enabled()) return empty(404);
  try {
    const result = await exchangeCode(getPool(), await json(request, 8192));
    return result
      ? Response.json(result, { headers: privateHeaders })
      : empty(400);
  } catch (error) {
    return failure(error);
  }
}
export async function revokeDevice(request: Request) {
  if (!enabled()) return empty(404);
  const hash = bearerHash(request);
  if (!hash) return empty(401);
  try {
    const { rows } = await getPool().query(
      "UPDATE telemetry_devices SET revoked_at = COALESCE(revoked_at, now()) WHERE token_hash=$1 RETURNING device_id",
      [hash],
    );
    return empty(rows.length ? 204 : 401);
  } catch {
    return empty(503);
  }
}
export async function receiveEvents(request: Request) {
  if (!enabled()) return empty(404);
  const hash = bearerHash(request);
  if (!hash) return empty(401);
  let client;
  try {
    const pool = getPool();
    const auth = await pool.query(
      "SELECT device_id FROM telemetry_devices WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()",
      [hash],
    );
    if (!auth.rows.length) return empty(401);
    const packet = await json(request, 256 * 1024);
    let batch;
    try {
      batch = parseBatch(packet);
    } catch {
      throw new HttpError(400);
    }
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '3s'");
    // Hold a shared row lock through ingestion. Revocation cannot race a partly committed batch.
    const { rows } = await client.query(
      "SELECT device_id FROM telemetry_devices WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now() FOR SHARE",
      [hash],
    );
    if (!rows.length) throw new HttpError(401);
    const device = rows[0].device_id;
    for (const e of batch.events)
      await client.query(
        "INSERT INTO telemetry_events(event_id,kind,occurred_at,plugin,skill,client,source,device_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING",
        [
          tokenHash(JSON.stringify([device, e.id])),
          e.kind,
          e.occurredAt,
          e.plugin,
          e.skill,
          e.client,
          e.source,
          device,
        ],
      );
    for (const m of batch.metrics)
      await client.query(
        "INSERT INTO telemetry_skill_metrics(stream_id,value,temporality,skill,invoke_type,plugin,device_id) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(stream_id) DO UPDATE SET value=GREATEST(telemetry_skill_metrics.value,EXCLUDED.value)",
        [
          tokenHash(JSON.stringify([device, m.id])),
          m.value,
          m.temporality,
          m.skill,
          m.invokeType,
          m.plugin,
          device,
        ],
      );
    await client.query("COMMIT");
    return Response.json({}, { headers: privateHeaders });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    return failure(error);
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
  try {
    const session = await browserSession(request);
    const { rows } = await getPool().query(
      "SELECT device_id,created_at,expires_at,revoked_at FROM telemetry_devices WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
      [session.user.id],
    );
    const items = rows
      .map((row) => {
        const id = String(row.device_id);
        const active =
          !row.revoked_at && new Date(row.expires_at).getTime() > Date.now();
        return `<li><code>${escape(id)}</code><br>Expires ${escape(new Date(row.expires_at).toISOString())}${active ? `<form method="post" action="/telemetry/devices"><input type="hidden" name="device_id" value="${escape(id)}"><input type="hidden" name="csrf" value="${consentToken(revokeParams(id), session.session.id, secret())}"><button>Revoke device</button></form>` : `<p>${row.revoked_at ? "Revoked" : "Expired"}</p>`}</li>`;
      })
      .join("");
    return html(
      `<h1>Connected monitoring devices</h1><p>Revocation stops this device from sending new counts. To stop the local collector and remove agent configuration, also run the CLI disable command.</p>${items ? `<ul>${items}</ul>` : "<p>No connected devices.</p>"}`,
    );
  } catch (error) {
    return failure(error);
  }
}
export async function devicesPost(request: Request) {
  if (!enabled()) return empty(404);
  try {
    requireOrigin(request);
    const session = await browserSession(request);
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
      throw new HttpError(403);
    await getPool().query(
      "UPDATE telemetry_devices SET revoked_at=now() WHERE device_id=$1 AND user_id=$2 AND revoked_at IS NULL",
      [input.device_id, session.user.id],
    );
    return new Response(null, {
      status: 303,
      headers: { ...privateHeaders, location: "/telemetry/devices" },
    });
  } catch (error) {
    return failure(error);
  }
}
