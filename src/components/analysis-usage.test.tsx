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
describe("internal usage counts", () => {
  it("does not query counts for anonymous visitors", async () => {
    mocks.session.mockResolvedValue(null);
    expect(await AnalysisUsage()).toBeNull();
    expect(mocks.usage).not.toHaveBeenCalled();
  });
  it("does not query counts for users outside the portal audience", async () => {
    mocks.session.mockResolvedValue({ user: { id: "test" } });
    mocks.member.mockResolvedValue(false);
    expect(await AnalysisUsage()).toBeNull();
    expect(mocks.usage).not.toHaveBeenCalled();
  });
  it("shows only the two totals to the existing portal audience", async () => {
    mocks.session.mockResolvedValue({ user: { id: "test" } });
    mocks.member.mockResolvedValue(true);
    mocks.usage.mockResolvedValue({ runs: 3, repositories: 2 });
    const html = renderToStaticMarkup(await AnalysisUsage());
    expect(html).toContain("2 unique repositories analysed");
    expect(html).toContain("3 total runs");
  });
  it("hides counts when authentication or storage cannot answer", async () => {
    mocks.session.mockRejectedValue(new Error("unavailable"));
    expect(await AnalysisUsage()).toBeNull();
  });
});
