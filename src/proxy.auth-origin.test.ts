import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getAuth: vi.fn() }));
vi.mock("@/lib/membership", () => ({ isOrgMember: vi.fn() }));
import proxy from "./proxy";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
});
afterEach(() => vi.unstubAllEnvs());

function request(path: string, host = "127.0.0.1:3000", method = "GET") {
  return new NextRequest(`http://${host}${path}`, {
    method,
    headers: { host },
  });
}

it("moves local login to the callback host before creating an OAuth state cookie", async () => {
  const result = await proxy(request("/login?next=%2Fskills%2Fhumanizer"));
  expect(result.status).toBe(307);
  expect(result.headers.get("location")).toBe(
    "http://localhost:3000/login?next=%2Fskills%2Fhumanizer",
  );
  expect(result.headers.has("set-cookie")).toBe(false);
});

it("keeps CLI consent parameters unchanged when selecting the local sign-in host", async () => {
  const query =
    "?state=abc&code_challenge=xyz&redirect_uri=http%3A%2F%2F127.0.0.1%3A49152%2Fcallback";
  const result = await proxy(request(`/telemetry/connect${query}`));
  expect(result.status).toBe(307);
  expect(result.headers.get("location")).toBe(
    `http://localhost:3000/telemetry/connect${query}`,
  );
});

it.each(["/login", "/api/auth/sign-in/social", "/telemetry/connect"])(
  "refuses a stale form on the wrong local host without creating state: %s",
  async (path) => {
    const result = await proxy(request(path, "127.0.0.1:3000", "POST"));
    expect(result.status).toBe(409);
    expect(result.headers.has("set-cookie")).toBe(false);
    expect(await result.json()).toEqual({
      error:
        "Open http://localhost:3000/login to continue on the configured sign-in host.",
    });
  },
);

it.each([
  "/api/auth/callback/github?code=test&state=test",
  "/api/auth/error?error=state_mismatch",
  "/api/telemetry/events",
])("does not move callbacks or authenticated telemetry: %s", async (path) => {
  const result = await proxy(request(path));
  expect(result.headers.get("x-middleware-next")).toBe("1");
  expect(result.headers.has("location")).toBe(false);
});

it.each(["localhost:3000", "127.0.0.1:4000", "localhost.evil.test:3000"])(
  "does not redirect the canonical host, another app, or a non-loopback host: %s",
  async (host) => {
    const result = await proxy(request("/login", host));
    expect(result.headers.has("location")).toBe(false);
  },
);

it.each(["https://devx.example", "not-a-url", "http://localhost:4000"])(
  "does not redirect local requests to a different configured app: %s",
  async (url) => {
    vi.stubEnv("BETTER_AUTH_URL", url);
    expect((await proxy(request("/login"))).headers.has("location")).toBe(
      false,
    );
  },
);

it("leaves deployments unchanged", async () => {
  vi.stubEnv("NODE_ENV", "production");
  expect((await proxy(request("/login"))).headers.has("location")).toBe(false);
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VERCEL", "1");
  expect((await proxy(request("/login"))).headers.has("location")).toBe(false);
});
