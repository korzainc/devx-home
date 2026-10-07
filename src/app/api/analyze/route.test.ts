import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST } from "./route";

// vitest hoists every vi.mock call above the imports above, regardless of where it's written, so
// POST (imported above) always sees these mocked modules - matching the pattern run.test.ts uses
// for its own vi.mock calls.
const getGitHubToken = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", () => ({ getGitHubToken, getSession }));

const isOrgMember = vi.hoisted(() => vi.fn());
vi.mock("@/lib/membership", () => ({ isOrgMember }));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

vi.mock("@/lib/catalogue", () => ({
  getBaseline: vi.fn(),
  tools: [],
  bundleById: {},
  toolNameById: {},
  capabilityLabels: {},
}));
vi.mock("@/lib/gap-llm-config", () => ({ getLlmConfig: vi.fn() }));

const runAnalysis = vi.hoisted(() => vi.fn());
vi.mock("@/lib/gap/run", () => ({ runAnalysis }));

const buildFixPrompt = vi.hoisted(() => vi.fn());
vi.mock("@/lib/gap/prompt", () => ({ buildFixPrompt }));

function postRequest(body: unknown) {
  return new Request("https://example.com/api/analyze", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const fakeSession = {
  user: { id: "u1", orgMember: true, orgCheckedAt: new Date() },
};

describe("POST /api/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tags a thrown session lookup with reason unavailable and status 503, not unauthenticated", async () => {
    getSession.mockRejectedValue(new Error("connection refused"));

    const res = await POST(postRequest({ repo: "korzainc/example" }));

    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe("unavailable");
    expect(isOrgMember).not.toHaveBeenCalled();
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it("tags an unauthenticated request with reason unauthenticated and status 401", async () => {
    getGitHubToken.mockResolvedValue(null);
    getSession.mockResolvedValue(null);

    const res = await POST(postRequest({ repo: "korzainc/example" }));

    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe("unauthenticated");
    expect(isOrgMember).not.toHaveBeenCalled();
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it("tags a signed-in non-member with reason not_org_member and status 403", async () => {
    getGitHubToken.mockResolvedValue("a-token");
    getSession.mockResolvedValue(fakeSession);
    isOrgMember.mockResolvedValue(false);

    const res = await POST(postRequest({ repo: "korzainc/example" }));

    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe("not_org_member");
    expect(getGitHubToken).not.toHaveBeenCalled();
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it("tags a lapsed GitHub grant with its own reason, not unauthenticated", async () => {
    getGitHubToken.mockResolvedValue(null);
    getSession.mockResolvedValue(fakeSession);
    isOrgMember.mockResolvedValue(true);

    const res = await POST(postRequest({ repo: "korzainc/example" }));

    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe("github_reauth_required");
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it("returns analysis and fixPrompt together on success", async () => {
    getGitHubToken.mockResolvedValue("a-token");
    getSession.mockResolvedValue(fakeSession);
    isOrgMember.mockResolvedValue(true);
    runAnalysis.mockResolvedValue({
      ok: true,
      analysis: { repo: "korzainc/example" },
    });
    buildFixPrompt.mockReturnValue("a fix prompt");

    const res = await POST(postRequest({ repo: "korzainc/example" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveProperty("analysis", { repo: "korzainc/example" });
    expect(body).toHaveProperty("fixPrompt", "a fix prompt");
    expect(runAnalysis).toHaveBeenCalledTimes(1);
    expect(buildFixPrompt).toHaveBeenCalledWith(
      { repo: "korzainc/example" },
      { bundleById: {}, toolNameById: {}, capabilityLabels: {} },
    );
  });

  it("omits fixPrompt entirely for a clean report instead of sending an empty string", async () => {
    getGitHubToken.mockResolvedValue("a-token");
    getSession.mockResolvedValue(fakeSession);
    isOrgMember.mockResolvedValue(true);
    runAnalysis.mockResolvedValue({
      ok: true,
      analysis: { repo: "korzainc/example" },
    });
    buildFixPrompt.mockReturnValue("");

    const res = await POST(postRequest({ repo: "korzainc/example" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).not.toHaveProperty("fixPrompt");
  });

  it("tags a GitHub 401 at read time with the shared github_reauth_required message", async () => {
    getGitHubToken.mockResolvedValue("a-token");
    getSession.mockResolvedValue(fakeSession);
    isOrgMember.mockResolvedValue(true);
    runAnalysis.mockResolvedValue({
      ok: false,
      status: 401,
      error: "GitHub rejected the token.",
    });

    const res = await POST(postRequest({ repo: "korzainc/example" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.reason).toBe("github_reauth_required");
    expect(body.error).toBe(
      "Your GitHub access needs refreshing. Sign in again on the website.",
    );
    expect(buildFixPrompt).not.toHaveBeenCalled();
  });

  it("tags a rate-limited analysis failure with reason rate_limited", async () => {
    getGitHubToken.mockResolvedValue("a-token");
    getSession.mockResolvedValue(fakeSession);
    isOrgMember.mockResolvedValue(true);
    runAnalysis.mockResolvedValue({
      ok: false,
      status: 429,
      error: "Rate limited.",
    });

    const res = await POST(postRequest({ repo: "korzainc/example" }));

    expect(res.status).toBe(429);
    expect((await res.json()).reason).toBe("rate_limited");
    expect(buildFixPrompt).not.toHaveBeenCalled();
  });

  it("passes through an analysis failure with no structured reason unchanged", async () => {
    getGitHubToken.mockResolvedValue("a-token");
    getSession.mockResolvedValue(fakeSession);
    isOrgMember.mockResolvedValue(true);
    runAnalysis.mockResolvedValue({
      ok: false,
      status: 404,
      error: "No such repository.",
    });

    const res = await POST(postRequest({ repo: "korzainc/example" }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe("No such repository.");
    expect(body.reason).toBeUndefined();
  });
});
