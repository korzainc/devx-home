import { describe, expect, it, vi } from "vitest";

// Stubs getAuth() itself rather than exercising the real Better Auth instance - this suite is
// about the route's own header-stripping, not about what bearer's after-hook does (auth.test.ts
// covers the real hook pipeline).
const handler = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getAuth: () => ({ handler }) }));

import { GET, POST } from "./route";

function responseWithAuthToken(exposedHeaders = "set-auth-token") {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "set-cookie": "better-auth.session_token=abc; Path=/; HttpOnly",
      "set-auth-token": "abc.def",
      "Access-Control-Expose-Headers": exposedHeaders,
    },
  });
}

describe("set-auth-token header stripping", () => {
  // bearer's after-hook adds this raw, unsigned session token to every response that sets the
  // session cookie - including an ordinary browser sign-in, which never touches the CLI.
  it("strips the header from the GitHub OAuth callback response", async () => {
    handler.mockResolvedValue(responseWithAuthToken());

    const res = await GET(
      new Request("https://example.com/api/auth/callback/github"),
    );

    expect(res.headers.has("set-auth-token")).toBe(false);
    expect(res.headers.has("access-control-expose-headers")).toBe(false);
  });

  it("keeps other exposed headers when stripping set-auth-token", async () => {
    handler.mockResolvedValue(
      responseWithAuthToken("x-custom, set-auth-token"),
    );

    const res = await GET(
      new Request("https://example.com/api/auth/get-session"),
    );

    expect(res.headers.get("access-control-expose-headers")).toBe("x-custom");
  });

  it("leaves /device/token's response untouched", async () => {
    handler.mockResolvedValue(responseWithAuthToken());

    const res = await POST(
      new Request("https://example.com/api/auth/device/token", {
        method: "POST",
      }),
    );

    expect(res.headers.get("set-auth-token")).toBe("abc.def");
  });
});
