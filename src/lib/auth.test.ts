import { memoryAdapter } from "better-auth/adapters/memory";
import { applySetCookies } from "better-auth/cookies/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuth, getAuth } from "./auth";

// Real getAuth(), not a mock: the point of this suite is to prove the plugins are actually wired
// into the betterAuth({...}) call, not to assert on assumptions about what they'd do. DATABASE_URL
// only has to parse as a connection string - nothing here needs a reachable database, since a
// present-but-unreachable one still proves the route is registered rather than 404ing.
beforeEach(() => {
  vi.stubEnv(
    "DATABASE_URL",
    "postgres://postgres:postgres@127.0.0.1:1/device_auth_test",
  );
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "test-client-id");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "test-client-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("device authorization plugin", () => {
  it("exposes the device code endpoint", async () => {
    const res = await getAuth().handler(
      new Request("http://localhost/api/auth/device/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: "korza-cli" }),
      }),
    );
    expect(res.status).not.toBe(404);
  });

  it("rejects a client_id the CLI didn't issue", async () => {
    const res = await getAuth().handler(
      new Request("http://localhost/api/auth/device/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: "someone-else" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("bearer plugin", () => {
  it("exposes bearer-header support on get-session, not just the cookie path", async () => {
    const res = await getAuth().handler(
      new Request("http://localhost/api/auth/get-session", {
        method: "GET",
        headers: { Authorization: "Bearer not-a-real-token" },
      }),
    );
    expect(res.status).not.toBe(404);
  });
});

// This suite builds a real betterAuth instance against better-auth/adapters/memory instead of
// getAuth()'s Postgres pool, so the hooks below run for real - the plugin pipeline, the global
// `hooks.before`, and `databaseHooks.session.create.before` - rather than being asserted against
// assumptions about what they'd do. There is no test database in this repo's vitest setup, and no
// mockSession/mockOrgMember helpers exist to import.
//
// isOrgMember itself is mocked: its own GitHub-backed decision logic is membership.test.ts's job.
// This suite is about whether that decision gates device approval, not about the decision itself.
vi.mock("./membership", () => ({ isOrgMember: vi.fn() }));

describe("device approval", () => {
  const BASE = "http://localhost/api/auth";

  async function testAuthInstance(opts: { orgMember?: boolean } = {}) {
    const { isOrgMember } = await import("./membership");
    vi.mocked(isOrgMember).mockResolvedValue(opts.orgMember ?? false);
    // Every model queried before any row of it exists must be seeded as `[]` - the memory
    // adapter throws "Model x not found" on a find against a table nothing has been created
    // into yet, which GitHub sign-in's own duplicate-account lookup does immediately.
    return createAuth(
      memoryAdapter({
        user: [],
        session: [],
        account: [],
        verification: [],
        deviceCode: [],
      }),
    );
  }

  // Stands in for GitHub's own token and profile endpoints during the real sign-in flow below.
  // Everything else - state issuance, the callback, cookie signing, user/account/session creation
  // - runs for real; only the network edge this suite can't reach is faked.
  function mockGithub() {
    return vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : input.toString();
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      if (url.startsWith("https://github.com/login/oauth/access_token")) {
        return json({ access_token: "gho_test_token", token_type: "bearer", scope: "" });
      }
      if (url.startsWith("https://api.github.com/user/emails")) {
        return json([]);
      }
      if (url.startsWith("https://api.github.com/user")) {
        return json({
          id: 1,
          login: "member",
          name: "Test Member",
          email: "member@example.com",
          avatar_url: null,
        });
      }
      throw new Error(`unmocked fetch in test: ${url}`);
    });
  }

  // A real /sign-in/social + /callback/github round trip, with only the GitHub network edge
  // mocked (see mockGithub): state issuance, its cookie, and session-cookie signing all run for
  // real, so the approval requests below carry a session indistinguishable from a browser's.
  async function signInTestUser(auth: Awaited<ReturnType<typeof testAuthInstance>>) {
    vi.stubGlobal("fetch", mockGithub());
    try {
      const headers = new Headers();
      const signInRes = await auth.handler(
        new Request(`${BASE}/sign-in/social`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "github",
            callbackURL: "http://localhost/",
            disableRedirect: true,
          }),
        }),
      );
      const signInSetCookie = signInRes.headers.get("set-cookie");
      if (!signInSetCookie) {
        throw new Error("test setup: sign-in/social did not set a state cookie");
      }
      applySetCookies(headers, [signInSetCookie]);
      const { url } = (await signInRes.json()) as { url: string };
      const state = new URL(url).searchParams.get("state");
      if (!state) {
        throw new Error("test setup: sign-in/social returned no state");
      }

      const callbackRes = await auth.handler(
        new Request(
          `${BASE}/callback/github?state=${encodeURIComponent(state)}&code=fake-code`,
          { method: "GET", headers },
        ),
      );
      const callbackSetCookie = callbackRes.headers.get("set-cookie");
      if (!callbackSetCookie) {
        throw new Error("test setup: callback did not set a session cookie");
      }
      applySetCookies(headers, [callbackSetCookie]);

      const cookie = headers.get("cookie");
      if (!cookie) {
        throw new Error("test setup: no session cookie after sign-in");
      }
      return { cookie };
    } finally {
      vi.unstubAllGlobals();
    }
  }

  async function startDeviceFlow(auth: Awaited<ReturnType<typeof testAuthInstance>>) {
    const res = await auth.handler(
      new Request(`${BASE}/device/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: "korza-cli" }),
      }),
    );
    const body = (await res.json()) as {
      device_code: string;
      user_code: string;
    };
    return { deviceCode: body.device_code, userCode: body.user_code };
  }

  function authHeaders(session?: { cookie: string }): Record<string, string> {
    return session ? { Cookie: session.cookie } : {};
  }

  async function claimDeviceCode(
    auth: Awaited<ReturnType<typeof testAuthInstance>>,
    userCode: string,
    session: { cookie: string },
  ) {
    await auth.handler(
      new Request(
        `${BASE}/device?user_code=${encodeURIComponent(userCode)}`,
        { method: "GET", headers: authHeaders(session) },
      ),
    );
  }

  function approveRequest(
    { userCode }: { userCode: string },
    session?: { cookie: string },
  ) {
    return new Request(`${BASE}/device/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(session) },
      body: JSON.stringify({ userCode }),
    });
  }

  function tokenRequest({ deviceCode }: { deviceCode: string }) {
    return new Request(`${BASE}/device/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceCode,
        client_id: "korza-cli",
      }),
    });
  }

  it("rejects device approval when there's no session at all", async () => {
    const auth = await testAuthInstance();
    const { userCode } = await startDeviceFlow(auth);

    const res = await auth.handler(approveRequest({ userCode })); // no cookie, no bearer

    expect(res.status).toBe(401);
  });

  it("rejects device approval from a signed-in non-member", async () => {
    const auth = await testAuthInstance({ orgMember: false });
    const session = await signInTestUser(auth);
    const { userCode } = await startDeviceFlow(auth);
    await claimDeviceCode(auth, userCode, session);

    const res = await auth.handler(approveRequest({ userCode }, session));

    expect(res.status).toBe(403);
  });

  it("gives a device-issued session a roughly 30-day expiry", async () => {
    const auth = await testAuthInstance({ orgMember: true });
    const session = await signInTestUser(auth);
    const { deviceCode, userCode } = await startDeviceFlow(auth);
    await claimDeviceCode(auth, userCode, session);

    const approveRes = await auth.handler(approveRequest({ userCode }, session));
    expect(approveRes.status).toBe(200);

    const tokenRes = await auth.handler(tokenRequest({ deviceCode }));
    const body = (await tokenRes.json()) as { expires_in: number };

    expect(body.expires_in).toBeGreaterThan(29 * 24 * 60 * 60);
    expect(body.expires_in).toBeLessThan(31 * 24 * 60 * 60);
  });

  it("leaves an ordinary sign-in session at the website's own, shorter default expiry", async () => {
    const auth = await testAuthInstance();
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.createUser(
      {
        email: "browser@example.com",
        name: "Browser User",
        emailVerified: true,
      },
      { method: "oauth", oauth: { providerId: "github" } },
    );

    // Created the same way a social sign-in does: outside /device/token, so the 30-day
    // override must not apply.
    const session = await ctx.internalAdapter.createSession(user.id);

    const expiresInMs = session!.expiresAt.getTime() - Date.now();
    expect(expiresInMs).toBeLessThan(29 * 24 * 60 * 60 * 1000);
  });
});
