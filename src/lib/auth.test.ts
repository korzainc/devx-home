import { memoryAdapter } from "better-auth/adapters/memory";
import { applySetCookies } from "better-auth/cookies/utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuth, getAuth } from "./auth";

// Real getAuth(), not a mock: this suite proves the plugins are actually wired into the
// betterAuth({...}) call. DATABASE_URL only needs to parse as a connection string - nothing
// here needs it reachable, since present-but-unreachable still proves the route is registered.
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
  // DATABASE_URL is deliberately unreachable (see beforeEach): this is about the route being
  // registered, not about a working response, and a real database would prove nothing extra.
  // That only holds if the unreachable-database failure mode is pinned down, not asserted as
  // merely "not 404" - a disabled path also returns 404.
  it("exposes the device code endpoint", async () => {
    const res = await getAuth().handler(
      new Request("http://localhost/api/auth/device/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: "korza-cli" }),
      }),
    );
    expect(res.status).toBe(500);
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

  // `/device` (unlike `/device/code|token|approve|deny`) claims a code from whatever session
  // cookie is on the request - no cookie is needed, since `/api/auth` is open and GET skips
  // the origin-check middleware. A `SameSite=lax` cookie rides cross-site navigation, so an
  // attacker's page could make a victim's browser claim the code with no typing involved.
  it("disables the bare GET claim endpoint the anti-phishing flow depends on being closed", async () => {
    const res = await getAuth().handler(
      new Request("http://localhost/api/auth/device?user_code=WDJB-MJHT", {
        method: "GET",
      }),
    );
    expect(res.status).toBe(404);
  });
});

// This suite builds a real betterAuth instance against better-auth/adapters/memory instead of
// getAuth()'s Postgres pool, so the hooks below run for real: the plugin pipeline, the global
// `hooks.before`, and `databaseHooks.session.create.before`. No test database exists in this
// repo's vitest setup, and no mockSession/mockOrgMember helpers exist to import.
//
// isOrgMember itself is mocked: membership.test.ts owns its GitHub-backed decision logic.
// This suite is about whether that decision gates device approval, not the decision itself.
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
        return json({
          access_token: "gho_test_token",
          token_type: "bearer",
          scope: "",
        });
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
  async function signInTestUser(
    auth: Awaited<ReturnType<typeof testAuthInstance>>,
  ) {
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
        throw new Error(
          "test setup: sign-in/social did not set a state cookie",
        );
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

  async function startDeviceFlow(
    auth: Awaited<ReturnType<typeof testAuthInstance>>,
  ) {
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

  // Calls `deviceVerify` directly through `auth.api`, the same way the real `claimDeviceCode`
  // server action does - not through the HTTP `GET /device` route, which is disabled (see
  // `disabledPaths` in ./auth.ts).
  async function claimDeviceCode(
    auth: Awaited<ReturnType<typeof testAuthInstance>>,
    userCode: string,
    session: { cookie: string },
  ) {
    const headers = new Headers(authHeaders(session));
    await auth.api.deviceVerify({ query: { user_code: userCode }, headers });
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

  // The membership hook's `before` runs ahead of bearer's own `before` hook that turns an
  // Authorization header into the cookie getSession can see, so a bearer-only request must fail
  // closed here the same as no session at all, even carrying a token.
  it("rejects a bearer-only request with no cookie", async () => {
    const auth = await testAuthInstance();
    const { userCode } = await startDeviceFlow(auth);

    const res = await auth.handler(
      new Request(`${BASE}/device/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer not-a-real-token",
        },
        body: JSON.stringify({ userCode }),
      }),
    );

    expect(res.status).not.toBe(200);
  });

  // approveDeviceLogin (src/app/device/actions.ts) calls auth.api.deviceApprove directly, not
  // auth.handler - this proves the membership hook runs on that real call path too, not only
  // over HTTP.
  it("rejects deviceApprove called directly through auth.api, not just the HTTP route", async () => {
    const auth = await testAuthInstance({ orgMember: false });
    const session = await signInTestUser(auth);
    const { userCode } = await startDeviceFlow(auth);
    await claimDeviceCode(auth, userCode, session);

    await expect(
      auth.api.deviceApprove({
        body: { userCode },
        headers: new Headers(authHeaders(session)),
      }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
  });

  // Each half of this is otherwise tested in isolation: /device/token issuing an access token,
  // and bearer authenticating a request given one. Nothing else proves one's output works as
  // the other's input.
  it("authenticates a /device/token access token as a bearer header on /get-session", async () => {
    const auth = await testAuthInstance({ orgMember: true });
    const session = await signInTestUser(auth);
    const { deviceCode, userCode } = await startDeviceFlow(auth);
    await claimDeviceCode(auth, userCode, session);
    await auth.handler(approveRequest({ userCode }, session));

    const tokenRes = await auth.handler(tokenRequest({ deviceCode }));
    const { access_token } = (await tokenRes.json()) as {
      access_token: string;
    };

    const res = await auth.handler(
      new Request(`${BASE}/get-session`, {
        headers: { Authorization: `Bearer ${access_token}` },
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { email: string } };
    expect(body.user.email).toBe("member@example.com");
  });

  it("claims a code typed with stray whitespace, lowercase letters, or dashes", async () => {
    const auth = await testAuthInstance({ orgMember: true });
    const session = await signInTestUser(auth);
    const { userCode } = await startDeviceFlow(auth);
    const mangled = ` ${userCode.toLowerCase().split("").join("-")} `;

    const result = await auth.api.deviceVerify({
      query: { user_code: mangled },
      headers: new Headers(authHeaders(session)),
    });

    expect(result.client_id).toBeDefined();
  });

  it("gives a device-issued session a roughly 30-day expiry", async () => {
    const auth = await testAuthInstance({ orgMember: true });
    const session = await signInTestUser(auth);
    const { deviceCode, userCode } = await startDeviceFlow(auth);
    await claimDeviceCode(auth, userCode, session);

    const approveRes = await auth.handler(
      approveRequest({ userCode }, session),
    );
    expect(approveRes.status).toBe(200);

    const tokenRes = await auth.handler(tokenRequest({ deviceCode }));
    const body = (await tokenRes.json()) as { expires_in: number };

    expect(body.expires_in).toBeGreaterThan(29 * 24 * 60 * 60);
    expect(body.expires_in).toBeLessThan(31 * 24 * 60 * 60);
  });

  it("leaves an ordinary sign-in session at the website's own, shorter default expiry", async () => {
    const auth = await testAuthInstance();
    // The real browser sign-in path (GitHub OAuth callback), not a bare internalAdapter call
    // with no request context - this proves the hook's /device/token path scoping actually
    // holds for a real request, not just that an empty ctx skips the override.
    const session = await signInTestUser(auth);

    const res = await auth.handler(
      new Request(`${BASE}/get-session`, {
        method: "GET",
        headers: authHeaders(session),
      }),
    );
    const body = (await res.json()) as { session: { expiresAt: string } };

    const expiresInMs = new Date(body.session.expiresAt).getTime() - Date.now();
    expect(expiresInMs).toBeLessThan(8 * 24 * 60 * 60 * 1000);
  });

  // The plugin accepts an optional, unauthenticated `user_id` on this request and stores it
  // directly as the device code's owner, which skips the "type the code to claim it" step the
  // two-step confirm flow depends on. The CLI never sends this field.
  it("rejects a user_id pre-binding on POST /device/code", async () => {
    const auth = await testAuthInstance();

    const res = await auth.handler(
      new Request(`${BASE}/device/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: "korza-cli",
          user_id: "someone-else",
        }),
      }),
    );

    expect(res.status).toBe(400);
  });

  // /device ignores this query param by design (phishing links, browser history/referrers), so a
  // client that naively opens it defeats that. The plugin still returns it; it must not reach
  // callers.
  it("strips verification_uri_complete from the /device/code response", async () => {
    const auth = await testAuthInstance();

    const res = await auth.handler(
      new Request(`${BASE}/device/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: "korza-cli" }),
      }),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(body.verification_uri).toBeTruthy();
    expect(body).not.toHaveProperty("verification_uri_complete");
  });

  describe("session refresh near expiry", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    // better-auth's own getSession refreshes expiresAt back out to the global 7-day default
    // whenever a session is within ~6 days of expiring, regardless of how long it was actually
    // issued for - which would make an actively-polled 30-day device session never truly expire.
    it("does not push a device session's expiry back out once it enters the refresh window", async () => {
      const auth = await testAuthInstance({ orgMember: true });
      const session = await signInTestUser(auth);
      const { deviceCode, userCode } = await startDeviceFlow(auth);
      await claimDeviceCode(auth, userCode, session);
      await auth.handler(approveRequest({ userCode }, session));

      const tokenRes = await auth.handler(tokenRequest({ deviceCode }));
      const { access_token } = (await tokenRes.json()) as {
        access_token: string;
      };

      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 25 * 24 * 60 * 60 * 1000); // 5 days left of 30

      const res = await auth.handler(
        new Request(`${BASE}/get-session`, {
          headers: { Authorization: `Bearer ${access_token}` },
        }),
      );
      const body = (await res.json()) as { session: { expiresAt: string } };
      const daysLeft =
        (new Date(body.session.expiresAt).getTime() - Date.now()) /
        (24 * 60 * 60 * 1000);

      expect(daysLeft).toBeGreaterThan(4.9);
      expect(daysLeft).toBeLessThan(5.1);
    });

    it("still refreshes an ordinary sign-in session once it enters the refresh window", async () => {
      const auth = await testAuthInstance();
      const session = await signInTestUser(auth);

      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 of 7 days in

      const res = await auth.handler(
        new Request(`${BASE}/get-session`, {
          headers: authHeaders(session),
        }),
      );
      const body = (await res.json()) as { session: { expiresAt: string } };
      const daysLeft =
        (new Date(body.session.expiresAt).getTime() - Date.now()) /
        (24 * 60 * 60 * 1000);

      expect(daysLeft).toBeGreaterThan(6.9);
      expect(daysLeft).toBeLessThan(7.1);
    });
  });
});
