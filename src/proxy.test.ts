import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// vitest hoists every vi.mock call above the static `import proxy from "./proxy"` below, so these
// need vi.hoisted too - matching the pattern api/analyze/route.test.ts uses for the same reason.
const api = vi.hoisted(() => ({ getSession: vi.fn() }));
const getAuth = vi.hoisted(() => vi.fn(() => ({ api })));
vi.mock("@/lib/auth", () => ({ getAuth }));

const isOrgMember = vi.hoisted(() => vi.fn());
vi.mock("@/lib/membership", () => ({ isOrgMember }));

import proxy from "./proxy";

const ORIGIN = "https://portal.example";

// /roadmap and /api/analyze are both gated by the real `isOpenPath` - neither is in gate.ts's
// OPEN list - so this exercises proxy.ts's own branching rather than a stand-in for the gate.
function requestFor(pathname: string) {
  return new NextRequest(`${ORIGIN}${pathname}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Vitest already runs with NODE_ENV=test, but stub both explicitly so a shell that exports
  // LOCAL_BYPASS_AUTH can't turn these cases into a silent pass-through.
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("LOCAL_BYPASS_AUTH", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy", () => {
  it("returns JSON 401 for an unauthenticated /api/* request instead of redirecting", async () => {
    api.getSession.mockResolvedValue(null);

    const res = await proxy(requestFor("/api/analyze"));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: "Log in with GitHub to continue.",
      reason: "unauthenticated",
    });
  });

  it("returns JSON 403 for a non-member /api/* request instead of redirecting", async () => {
    api.getSession.mockResolvedValue({
      user: { id: "u1", orgMember: false, orgCheckedAt: null },
    });
    isOrgMember.mockResolvedValue(false);

    const res = await proxy(requestFor("/api/analyze"));

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "You're not a member of the Korza GitHub organization.",
      reason: "not_org_member",
    });
  });

  it("passes through an org member's /api/* request instead of answering itself", async () => {
    api.getSession.mockResolvedValue({
      user: { id: "u1", orgMember: true, orgCheckedAt: new Date() },
    });
    isOrgMember.mockResolvedValue(true);

    const res = await proxy(requestFor("/api/analyze"));

    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("still redirects an unauthenticated page request to /login", async () => {
    api.getSession.mockResolvedValue(null);

    const res = await proxy(requestFor("/roadmap"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/login?next=%2Froadmap`);
  });

  it("still redirects a signed-in non-member page request to /no-access", async () => {
    api.getSession.mockResolvedValue({
      user: { id: "u1", orgMember: false, orgCheckedAt: null },
    });
    isOrgMember.mockResolvedValue(false);

    const res = await proxy(requestFor("/roadmap"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/no-access`);
  });
});
