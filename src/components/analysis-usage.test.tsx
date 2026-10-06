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
  it("does not read aggregate totals for signed-out visitors", async () => {
    mocks.session.mockResolvedValue(null);
    mocks.usage.mockResolvedValue({ runs: 3, repositories: 2 });

    expect(await AnalysisUsage()).toBeNull();
    expect(mocks.member).not.toHaveBeenCalled();
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  it("does not read aggregate totals for signed-in non-members", async () => {
    mocks.session.mockResolvedValue({ user: { id: "outside" } });
    mocks.member.mockResolvedValue(false);
    mocks.usage.mockResolvedValue({ runs: 3, repositories: 2 });

    expect(await AnalysisUsage()).toBeNull();
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  it("shows aggregate totals after the existing membership gate succeeds", async () => {
    const user = { id: "member" };
    mocks.session.mockResolvedValue({ user });
    mocks.member.mockResolvedValue(true);
    mocks.usage.mockResolvedValue({ runs: 3, repositories: 2 });

    const html = renderToStaticMarkup(await AnalysisUsage());
    expect(html).toContain("2 unique repositories analysed");
    expect(html).toContain("3 total runs");
    expect(mocks.member).toHaveBeenCalledWith(expect.any(Headers), user);
    expect(mocks.usage).toHaveBeenCalledOnce();
  });

  it("does not read totals when the session check fails", async () => {
    mocks.session.mockRejectedValue(new Error("unavailable"));
    mocks.usage.mockResolvedValue({ runs: 3, repositories: 2 });

    expect(await AnalysisUsage()).toBeNull();
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  it("does not read totals when the membership check fails", async () => {
    mocks.session.mockResolvedValue({ user: { id: "member" } });
    mocks.member.mockRejectedValue(new Error("unavailable"));
    mocks.usage.mockResolvedValue({ runs: 3, repositories: 2 });

    expect(await AnalysisUsage()).toBeNull();
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  it("hides counts when storage cannot answer", async () => {
    mocks.session.mockResolvedValue({ user: { id: "member" } });
    mocks.member.mockResolvedValue(true);
    mocks.usage.mockRejectedValue(new Error("unavailable"));
    expect(await AnalysisUsage()).toBeNull();
  });
});
