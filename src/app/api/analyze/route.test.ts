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

vi.mock("@/lib/catalogue", () => ({ getBaseline: vi.fn(), tools: [] }));
vi.mock("@/lib/gap-llm-config", () => ({ getLlmConfig: vi.fn() }));

const runAnalysis = vi.hoisted(() => vi.fn());
vi.mock("@/lib/gap/run", () => ({ runAnalysis }));

function postRequest(body: unknown) {
  return new Request("https://example.com/api/analyze", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 with no GitHub token, before ever checking membership", async () => {
    getGitHubToken.mockResolvedValue(null);

    const res = await POST(postRequest({ repo: "korzainc/example" }));

    expect(res.status).toBe(401);
    expect(isOrgMember).not.toHaveBeenCalled();
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it(
    "returns 401 as defense-in-depth when a token exists but org membership fails, " +
      "without depending on proxy.ts having run",
    async () => {
      getGitHubToken.mockResolvedValue("a-token");
      getSession.mockResolvedValue({
        user: { id: "u1", orgMember: false, orgCheckedAt: null },
      });
      isOrgMember.mockResolvedValue(false);

      const res = await POST(postRequest({ repo: "korzainc/example" }));

      expect(res.status).toBe(401);
      expect(runAnalysis).not.toHaveBeenCalled();
    },
  );

  it("returns 401 when a token exists but there is no session to check membership against", async () => {
    getGitHubToken.mockResolvedValue("a-token");
    getSession.mockResolvedValue(null);

    const res = await POST(postRequest({ repo: "korzainc/example" }));

    expect(res.status).toBe(401);
    expect(isOrgMember).not.toHaveBeenCalled();
    expect(runAnalysis).not.toHaveBeenCalled();
  });

  it("calls runAnalysis and returns its result when the token and org membership both check out", async () => {
    getGitHubToken.mockResolvedValue("a-token");
    getSession.mockResolvedValue({
      user: { id: "u1", orgMember: true, orgCheckedAt: new Date() },
    });
    isOrgMember.mockResolvedValue(true);
    runAnalysis.mockResolvedValue({
      ok: true,
      analysis: { repo: "korzainc/example" },
    });

    const res = await POST(postRequest({ repo: "korzainc/example" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ repo: "korzainc/example" });
    expect(runAnalysis).toHaveBeenCalledTimes(1);
  });
});
