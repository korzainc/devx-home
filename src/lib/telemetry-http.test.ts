import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  member: vi.fn(),
  telemetryMember: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}));
vi.mock("./auth", () => ({
  getAuth: () => ({ api: { getSession: mocks.getSession } }),
}));
vi.mock("./membership", () => ({ isOrgMember: mocks.member }));
vi.mock("./telemetry-membership", async (original) => ({
  ...(await original<typeof import("./telemetry-membership")>()),
  telemetryMembership: mocks.telemetryMember,
}));
vi.mock("./db", () => ({
  getPool: () => ({
    query: mocks.query,
    connect: async () => ({ query: mocks.query, release: mocks.release }),
  }),
}));
import {
  connectGet,
  connectPost,
  revokeDevice,
  devicesPost,
  exchangePost,
  devicesGet,
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
function expectCallbackError(response: Response, error: string) {
  expect(response.status).toBe(303);
  const location = new URL(response.headers.get("location")!);
  expect(location.origin + location.pathname).toBe(params.redirect_uri);
  expect([...location.searchParams.entries()].sort()).toEqual(
    [
      ["error", error],
      ["state", params.state],
    ].sort(),
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
}
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("KORZA_LOCAL_USAGE", "1");
  vi.stubEnv("DATABASE_URL", "postgresql://fixture:unused@127.0.0.1/fixture");
  vi.stubEnv("TELEMETRY_ENABLED", "1");
  vi.stubEnv("BETTER_AUTH_SECRET", "secret");
  mocks.getSession.mockResolvedValue(session);
  mocks.member.mockResolvedValue(true);
  mocks.telemetryMember.mockResolvedValue(true);
  mocks.query.mockResolvedValue({ rows: [] });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
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
  expect(r.headers.get("referrer-policy")).toBe("same-origin");
  expect(await r.text()).toContain("Allow monitoring");
  expect(mocks.query).not.toHaveBeenCalled();
});
it("requires the real browser session and fails closed on denied fresh membership", async () => {
  mocks.getSession.mockResolvedValue(null);
  expect((await connectPost(consent())).status).toBe(401);
  mocks.getSession.mockResolvedValue(session);
  mocks.member.mockResolvedValue(false);
  expectCallbackError(await connectPost(consent()), "access_denied");
  expect(mocks.member).toHaveBeenCalledWith(expect.any(Headers), session.user, {
    fresh: true,
    throwOnError: true,
  });
  expect(mocks.query).not.toHaveBeenCalled();
});
it("rejects cross-origin consent, missing token and callback tampering", async () => {
  for (const request of [
    consent({}, "https://attacker.example"),
    consent({}, "null"),
    consent({ csrf: "" }),
    consent({ redirect_uri: "http://127.0.0.1:50000/callback" }),
  ]) {
    const response = await connectPost(request);
    expect(response.status).toBe(403);
    expect(response.headers.has("location")).toBe(false);
  }
  expect(mocks.query).not.toHaveBeenCalled();
});
it("returns a verified consent outage to the CLI without exposing provider details", async () => {
  mocks.member.mockRejectedValue(
    new Error("fixture-private-provider-response"),
  );
  const response = await connectPost(consent());
  expectCallbackError(response, "temporarily_unavailable");
  expect(await response.text()).toBe("");
  expect(mocks.query).not.toHaveBeenCalled();
  expect(console.error).toHaveBeenCalledExactlyOnceWith(
    "Telemetry request failed.",
    { operation: "consent", stage: "membership", status: 503 },
  );
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
  mocks.query.mockResolvedValue({ rows: [{ id: "user" }] });
  const r = await connectPost(consent());
  expect(r.status).toBe(303);
  expect(r.headers.get("referrer-policy")).toBe("no-referrer");
  const u = new URL(r.headers.get("location")!);
  expect(u.searchParams.get("code")).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect([...u.searchParams.keys()].sort()).toEqual(["code", "state"]);
  expect(r.headers.get("cache-control")).toBe("no-store");
});
it("keeps rollout disabled until explicitly enabled", async () => {
  vi.stubEnv("TELEMETRY_ENABLED", "0");
  expect(
    (await connectGet(new Request(base + "/telemetry/connect"))).status,
  ).toBe(404);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("allows bearer self-revocation and rejects invalid token", async () => {
  expect((await revokeDevice(ingest({}, "bad"))).status).toBe(401);
  mocks.query.mockResolvedValue({
    rows: [
      { device_id: "device", user_id: "user", orgMember: true, fresh: true },
    ],
    rowCount: 1,
  });
  expect((await revokeDevice(ingest({}))).status).toBe(204);
  expect(
    mocks.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE"))?.[0],
  ).toContain("SET revoked_at = COALESCE(revoked_at, now())");
  expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
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
  const ownership = mocks.query.mock.calls.find(([sql]) =>
    sql.startsWith("SELECT device_id"),
  )!;
  expect(ownership[1]).toEqual([device, "user"]);
  expect(ownership[0]).toContain("user_id=$2");
});
it("exchange responses never cache device credentials", async () => {
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.startsWith('SELECT id FROM "user"')
      ? [{ id: "user" }]
      : /^(SELECT user_id,device_id|DELETE FROM telemetry_codes)/.test(sql)
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
  expectCallbackError(await connectPost(request()), "temporarily_unavailable");
  expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(
    false,
  );
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.startsWith('SELECT id FROM "user"') ? [{ id: "user" }] : [],
  }));
  expectCallbackError(await connectPost(request()), "access_denied");
  expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(
    false,
  );
  mocks.query.mockImplementation(async (sql: string) => ({
    rows: sql.startsWith('SELECT id FROM "user"')
      ? [{ id: "user" }]
      : sql.startsWith("SELECT device_id")
        ? [{ device_id: device }]
        : [],
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

it("explains an expired revoke form without revoking or accepting its stale CSRF", async () => {
  const device = "11111111-1111-4111-8111-111111111111";
  const csrf = consentToken(
    { redirect_uri: "revoke", state: device, code_challenge: "" },
    "session",
    "secret",
    Date.now() - 600001,
  );
  const response = await devicesPost(
    new Request(base + "/telemetry/devices", {
      method: "POST",
      headers: {
        origin: base,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ device_id: device, csrf }),
    }),
  );
  expect(response.status).toBe(403);
  const body = await response.text();
  expect(body).toContain("This form expired or could not be verified");
  expect(body).toContain('href="/telemetry/devices"');
  expect(body).toContain("No device was revoked");
  expect(body).not.toContain(csrf);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.query).not.toHaveBeenCalled();
});

it("retries consent when stored membership cannot confirm the fresh verdict", async () => {
  // A rejoining member's positive provider verdict may fail to persist. A
  // concurrent removal produces the same mismatch, so never mint a grant.
  expectCallbackError(await connectPost(consent()), "temporarily_unavailable");
  expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(
    false,
  );
});
it.each(["preview", "development"])(
  "disables every device route on %s",
  async (environment) => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", environment);
    const responses = await Promise.all([
      connectGet(new Request(base + "/telemetry/connect")),
      connectPost(consent()),
      devicesGet(new Request(base + "/telemetry/devices")),
      devicesPost(consent()),
      exchangePost(ingest({})),
      revokeDevice(ingest({})),
    ]);
    expect(responses.map((r) => r.status)).toEqual(Array(6).fill(404));
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  },
);

it.each([
  {
    operation: "connect",
    stage: "session",
    run: () =>
      connectGet(
        new Request(
          base +
            "/telemetry/connect?" +
            new URLSearchParams({ ...params, code_challenge_method: "S256" }),
        ),
      ),
  },
  { operation: "consent", stage: "session", run: () => connectPost(consent()) },
  {
    operation: "exchange",
    stage: "storage",
    run: () =>
      exchangePost(
        ingest({
          code: "c".repeat(43),
          code_verifier: "v".repeat(43),
          redirect_uri: params.redirect_uri,
        }),
      ),
  },
  {
    operation: "revoke",
    stage: "storage",
    run: () => revokeDevice(ingest({})),
  },
  {
    operation: "devices",
    stage: "session",
    run: () => devicesGet(new Request(base + "/telemetry/devices")),
  },
  {
    operation: "device-revoke",
    stage: "session",
    run: () => devicesPost(consent()),
  },
])(
  "logs only safe outage context for $operation",
  async ({ operation, stage, run }) => {
    const error = Object.assign(new Error("fixture-secret-token"), {
      detail: "fixture-private-sql-values",
      code: "fixture-private-provider-response",
    });
    mocks.getSession.mockRejectedValue(error);
    mocks.query.mockRejectedValue(error);
    const response = await run();
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "Telemetry request failed.",
      {
        operation,
        stage,
        status: 503,
      },
    );
  },
);

it("does not report client rejections or disabled routes as outages", async () => {
  expect(
    (await connectPost(consent({}, "https://attacker.example"))).status,
  ).toBe(403);
  expect(console.error).not.toHaveBeenCalled();
});
