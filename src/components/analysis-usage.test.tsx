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

    expect(
      await AnalysisUsage({ recorded: new Promise<void>(() => {}) }),
    ).toBeNull();
    expect(mocks.member).not.toHaveBeenCalled();
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  it("does not read aggregate totals for signed-in non-members", async () => {
    mocks.session.mockResolvedValue({ user: { id: "outside" } });
    mocks.member.mockResolvedValue(false);
    mocks.usage.mockResolvedValue({ runs: 3, repositories: 2 });

    expect(
      await AnalysisUsage({ recorded: new Promise<void>(() => {}) }),
    ).toBeNull();
    expect(mocks.usage).not.toHaveBeenCalled();
  });

  it("reads the current totals only after recording finishes and the membership gate succeeds", async () => {
    const user = { id: "member" };
    mocks.session.mockResolvedValue({ user });
    mocks.member.mockResolvedValue(true);
    mocks.usage.mockResolvedValue({ runs: 3, repositories: 2 });

    let finishRecording!: () => void;
    const recorded = new Promise<void>(
      (resolve) => (finishRecording = resolve),
    );
    const component = AnalysisUsage({ recorded });
    await vi.waitFor(() => expect(mocks.member).toHaveBeenCalledOnce());
    expect(mocks.usage).not.toHaveBeenCalled();
    finishRecording();

    const html = renderToStaticMarkup(await component);
    expect(html.replace(/<[^>]*>/g, "")).toContain(
      "2 repositories analysed · 3 total runs",
    );
    expect(html).toContain('aria-label="Site-wide analysis usage"');
    expect(mocks.member).toHaveBeenCalledWith(expect.any(Headers), user);
    expect(mocks.usage).toHaveBeenCalledOnce();
  });

  it("uses singular labels for a single repository and run", async () => {
    mocks.session.mockResolvedValue({ user: { id: "member" } });
    mocks.member.mockResolvedValue(true);
    mocks.usage.mockResolvedValue({ runs: 1, repositories: 1 });

    expect(
      renderToStaticMarkup(await AnalysisUsage()).replace(/<[^>]*>/g, ""),
    ).toContain("1 repository analysed · 1 total run");
  });

  it("hides counts if the recording promise unexpectedly rejects", async () => {
    mocks.session.mockResolvedValue({ user: { id: "member" } });
    mocks.member.mockResolvedValue(true);
    let failRecording!: (error: Error) => void;
    const recorded = new Promise<void>(
      (_resolve, reject) => (failRecording = reject),
    );
    const component = AnalysisUsage({ recorded });
    await vi.waitFor(() => expect(mocks.member).toHaveBeenCalledOnce());
    failRecording(new Error("unexpected recorder failure"));

    expect(await component).toBeNull();
    expect(mocks.usage).not.toHaveBeenCalled();
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
