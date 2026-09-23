import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  member: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));
vi.mock("./auth", () => ({
  getAuth: () => ({ api: { getSession: mocks.getSession } }),
}));
vi.mock("./membership", () => ({ isOrgMember: mocks.member }));
vi.mock("./db", () => ({
  getPool: () => ({
    query: mocks.query,
    connect: async () => ({ query: mocks.query, release: mocks.release }),
  }),
}));
import {
  connectGet,
  connectPost,
  receiveEvents,
  revokeDevice,
  devicesPost,
  exchangePost,
} from "./telemetry-http";
import { consentToken } from "./telemetry-auth";
const params = {
  redirect_uri: "http://127.0.0.1:49152/callback",
  state: "s".repeat(43),
  code_challenge: "a".repeat(43),
};
const session = {
  user: { id: "user", orgMember: true },
  session: { id: "session" },
};
const base = "https://home.example";
function consent(overrides: Record<string, string> = {}, origin = base) {
  const body = new URLSearchParams({
    ...params,
    decision: "allow",
    csrf: consentToken(params, "session", "secret"),
    ...overrides,
  });
  return new Request(base + "/telemetry/connect", {
    method: "POST",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}
function ingest(body: unknown, token = "korza_" + "a".repeat(43)) {
  return new Request(base + "/api/telemetry/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("TELEMETRY_ENABLED", "1");
  vi.stubEnv("BETTER_AUTH_SECRET", "secret");
  mocks.getSession.mockResolvedValue(session);
  mocks.member.mockResolvedValue(true);
  mocks.query.mockResolvedValue({ rows: [] });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("GET displays consent without issuing a grant", async () => {
  const r = await connectGet(
    new Request(
      base +
        "/telemetry/connect?" +
        new URLSearchParams({ ...params, code_challenge_method: "S256" }),
    ),
  );
  expect(r.status).toBe(200);
  expect(await r.text()).toContain("Allow monitoring");
  expect(mocks.query).not.toHaveBeenCalled();
});
it("requires the real browser session and fails closed on denied fresh membership", async () => {
  mocks.getSession.mockResolvedValue(null);
  expect((await connectPost(consent())).status).toBe(401);
  mocks.getSession.mockResolvedValue(session);
  mocks.member.mockResolvedValue(false);
  expect((await connectPost(consent())).status).toBe(403);
  expect(mocks.member).toHaveBeenCalledWith(expect.any(Headers), session.user, {
    fresh: true,
  });
  expect(mocks.query).not.toHaveBeenCalled();
});
it("rejects cross-origin consent, missing token and callback tampering", async () => {
  expect(
    (await connectPost(consent({}, "https://attacker.example"))).status,
  ).toBe(403);
  expect((await connectPost(consent({ csrf: "" }))).status).toBe(403);
  expect(
    (
      await connectPost(
        consent({ redirect_uri: "http://127.0.0.1:50000/callback" }),
      )
    ).status,
  ).toBe(403);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("denial returns state and no credential or code", async () => {
  const r = await connectPost(consent({ decision: "deny" }));
  expect(r.status).toBe(303);
  const u = new URL(r.headers.get("location")!);
  expect(u.searchParams.get("error")).toBe("access_denied");
  expect(u.searchParams.get("state")).toBe(params.state);
  expect(u.searchParams.has("code")).toBe(false);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("allow redirects with only a one-time code and state", async () => {
  const r = await connectPost(consent());
  expect(r.status).toBe(303);
  const u = new URL(r.headers.get("location")!);
  expect(u.searchParams.get("code")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect([...u.searchParams.keys()].sort()).toEqual(["code", "state"]);
  expect(r.headers.get("cache-control")).toBe("no-store");
});
it("keeps rollout disabled until explicitly enabled", async () => {
  vi.stubEnv("TELEMETRY_ENABLED", "0");
  expect(
    (await receiveEvents(ingest({ events: [], metrics: [] }))).status,
  ).toBe(404);
  expect(
    (await connectGet(new Request(base + "/telemetry/connect"))).status,
  ).toBe(404);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("rejects missing, expired or revoked credentials before accepting telemetry", async () => {
  expect(
    (await receiveEvents(ingest({ events: [], metrics: [] }, "bad"))).status,
  ).toBe(401);
  expect(
    (await receiveEvents(ingest({ events: [], metrics: [] }))).status,
  ).toBe(401);
  expect(
    mocks.query.mock.calls.find(([sql]) =>
      sql.includes("SELECT device_id"),
    )?.[0],
  ).toContain("revoked_at IS NULL");
});
it("bounds the decoded request stream", async () => {
  mocks.query.mockResolvedValue({ rows: [{ device_id: "device" }] });
  expect(
    (
      await receiveEvents(
        ingest({ events: [], metrics: [], junk: "a".repeat(262144) }),
      )
    ).status,
  ).toBe(413);
});
it("scopes identities by device and inserts atomically with retry dedupe", async () => {
  mocks.query.mockResolvedValue({ rows: [{ device_id: "device" }] });
  const event = {
    id: "b".repeat(64),
    kind: "plugin_installed",
    client: "codex",
    source: "korza_cli",
    occurredAt: "2026-09-23T00:00:00.000Z",
    plugin: "humanizer",
    skill: null,
  };
  expect(
    (await receiveEvents(ingest({ events: [event], metrics: [] }))).status,
  ).toBe(200);
  const insert = mocks.query.mock.calls.find(([sql]) =>
    sql.includes("INSERT INTO telemetry_events"),
  );
  expect(insert?.[0]).toContain("ON CONFLICT DO NOTHING");
  expect(insert?.[1][0]).not.toBe(event.id);
  expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
});
it("allows bearer self-revocation and rejects invalid token", async () => {
  expect((await revokeDevice(ingest({}, "bad"))).status).toBe(401);
  mocks.query.mockResolvedValue({
    rows: [{ device_id: "device" }],
    rowCount: 1,
  });
  expect((await revokeDevice(ingest({}))).status).toBe(204);
  expect(mocks.query.mock.calls.at(-1)?.[0]).toContain(
    "SET revoked_at = COALESCE(revoked_at, now())",
  );
});

it("browser revocation binds CSRF and updates only the session owner's device", async () => {
  const device = "11111111-1111-4111-8111-111111111111";
  const csrf = consentToken(
    { redirect_uri: "revoke", state: device, code_challenge: "" },
    "session",
    "secret",
  );
  const make = (token: string, origin = base) =>
    new Request(base + "/telemetry/devices", {
      method: "POST",
      headers: { origin, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ device_id: device, csrf: token }),
    });
  expect(
    (await devicesPost(make(csrf, "https://attacker.example"))).status,
  ).toBe(403);
  expect((await devicesPost(make("bad"))).status).toBe(403);
  expect(mocks.query).not.toHaveBeenCalled();
  expect((await devicesPost(make(csrf))).status).toBe(303);
  expect(mocks.query.mock.calls[0][1]).toEqual([device, "user"]);
  expect(mocks.query.mock.calls[0][0]).toContain("user_id=$2");
});
it("rechecks revocation inside the ingestion transaction", async () => {
  mocks.query.mockImplementation(async (sql: string) => ({
    rows:
      sql.includes("SELECT device_id") && !sql.includes("FOR SHARE")
        ? [{ device_id: "device" }]
        : [],
  }));
  expect(
    (await receiveEvents(ingest({ events: [], metrics: [] }))).status,
  ).toBe(401);
  expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
});
it("rejects invalid content type, encoded bodies and unknown fields without inserts", async () => {
  mocks.query.mockResolvedValue({ rows: [{ device_id: "device" }] });
  const req = ingest({ events: [], metrics: [] });
  req.headers.set("content-encoding", "gzip");
  expect((await receiveEvents(req)).status).toBe(415);
  const req2 = ingest({ events: [], metrics: [] });
  req2.headers.set("content-type", "text/plain");
  expect((await receiveEvents(req2)).status).toBe(415);
  expect(
    (await receiveEvents(ingest({ events: [], metrics: [], prompt: "secret" })))
      .status,
  ).toBe(400);
  expect(mocks.query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(
    false,
  );
});
it("exchange responses never cache device credentials", async () => {
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.includes("DELETE FROM telemetry_codes")
      ? [{ user_id: "user" }]
      : [],
  }));
  const req = new Request(base + "/api/telemetry/exchange", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      code: "c".repeat(43),
      code_verifier: "v".repeat(43),
      redirect_uri: params.redirect_uri,
    }),
  });
  const result = await exchangePost(req);
  expect(result.status).toBe(200);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(await result.json()).toEqual({
    token: expect.stringMatching(/^korza_/),
    device_id: expect.any(String),
    expires_at: expect.any(String),
  });
});

it("requires S256 explicitly on browser entry and rejects plain or missing methods", async () => {
  for (const method of ["plain", "S512", ""]) {
    const q = new URLSearchParams(params);
    if (method) q.set("code_challenge_method", method);
    expect(
      (await connectGet(new Request(base + "/telemetry/connect?" + q))).status,
    ).toBe(400);
  }
  expect(mocks.query).not.toHaveBeenCalled();
});

it("accepts CSRF-bound renewal only for the current user's device", async () => {
  const device = "11111111-1111-4111-8111-111111111111";
  const renewal = { ...params, device_id: device };
  const q = new URLSearchParams({ ...renewal, code_challenge_method: "S256" });
  const get = await connectGet(new Request(base + "/telemetry/connect?" + q));
  expect(get.status).toBe(200);
  expect(await get.text()).toContain(`name="device_id" value="${device}"`);
  const csrf = consentToken(renewal, "session", "secret");
  const request = (id = device) =>
    new Request(base + "/telemetry/connect", {
      method: "POST",
      headers: {
        origin: base,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        ...renewal,
        device_id: id,
        csrf,
        decision: "allow",
      }),
    });
  expect(
    (await connectPost(request("22222222-2222-4222-8222-222222222222"))).status,
  ).toBe(403);
  expect(mocks.query).not.toHaveBeenCalled();
  expect((await connectPost(request())).status).toBe(403);
  expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(
    false,
  );
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.startsWith("SELECT device_id") ? [{ device_id: device }] : [],
  }));
  expect((await connectPost(request())).status).toBe(303);
  expect(
    mocks.query.mock.calls.find(([sql]) =>
      sql.startsWith("INSERT INTO telemetry_codes"),
    )?.[1],
  ).toContain(device);
  q.set("device_id", "bad");
  expect(
    (await connectGet(new Request(base + "/telemetry/connect?" + q))).status,
  ).toBe(400);
});
