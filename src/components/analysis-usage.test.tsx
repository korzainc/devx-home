/** @vitest-environment node */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AnalysisUsage } from "./analysis-usage";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  member: vi.fn(),
  usage: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/membership", () => ({ isOrgMember: mocks.member }));
vi.mock("@/lib/analysis-usage", () => ({ readAnalysisUsage: mocks.usage }));
afterEach(() => vi.resetAllMocks());
describe("analysis usage counts", () => {
  it("shows aggregate totals without requiring sign-in", async () => {
    mocks.session.mockResolvedValue(null);
    mocks.usage.mockResolvedValue({ runs: 3, repositories: 2 });
    const html = renderToStaticMarkup(await AnalysisUsage());
    expect(html).toContain("2 unique repositories analysed");
    expect(html).toContain("3 total runs");
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.member).not.toHaveBeenCalled();
  });
  it("hides counts when storage cannot answer", async () => {
    mocks.usage.mockRejectedValue(new Error("unavailable"));
    expect(await AnalysisUsage()).toBeNull();
  });
});
