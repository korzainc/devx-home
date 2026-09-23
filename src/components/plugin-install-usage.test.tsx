/** @vitest-environment node */
import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PluginInstallUsage } from "./plugin-install-usage";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  member: vi.fn(),
  installs: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/membership", () => ({ isOrgMember: mocks.member }));
vi.mock("@/lib/skill-usage", () => ({ readPluginInstalls: mocks.installs }));
afterEach(() => vi.resetAllMocks());
it("does not read install totals without portal access", async () => {
  mocks.session.mockResolvedValue(null);
  expect(await PluginInstallUsage({ plugin: "humanizer" })).toBeNull();
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(false);
  expect(await PluginInstallUsage({ plugin: "humanizer" })).toBeNull();
  expect(mocks.installs).not.toHaveBeenCalled();
});
it("labels the count as recorded installs for Claude Code", async () => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(true);
  mocks.installs.mockResolvedValue({ claude: 2, codex: 3 });
  const html = renderToStaticMarkup(
    await PluginInstallUsage({ plugin: "humanizer" }),
  );
  expect(html).toContain("recorded installs");
  expect(html).toContain("Claude Code");
  expect(html).toContain("Codex");
  expect(html).toContain("through Korza CLI");
  expect(html).not.toContain("About this count");
  expect(mocks.installs).toHaveBeenCalledWith("humanizer");
});
it("omits unavailable totals without blocking the page", async () => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(true);
  mocks.installs.mockRejectedValue(new Error("offline"));
  expect(await PluginInstallUsage({ plugin: "humanizer" })).toBeNull();
});
