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
  mocks.installs.mockResolvedValue({ claudeNative: 2, codexKorza: 3 });
  const html = renderToStaticMarkup(
    await PluginInstallUsage({ plugin: "superpowers" }),
  );
  expect(html).toContain("installs reported by Claude Code");
  expect(html).toContain("Claude Code");
  expect(html).toContain("Codex");
  expect(html).toContain("through Korza CLI");
  expect(html).not.toContain("Self-reported by installations that opted in");
  expect(html).not.toContain("About this count");
  expect(html).not.toContain("These counts can overlap");
  expect(mocks.installs).toHaveBeenCalledWith("superpowers");
});
it("omits unavailable totals without blocking the page", async () => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(true);
  mocks.installs.mockRejectedValue(new Error("offline"));
  expect(await PluginInstallUsage({ plugin: "humanizer" })).toBeNull();
});

it("shows native Codex installs without needing another reporting source", async () => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(true);
  mocks.installs.mockResolvedValue({ codexNative: 1 });
  const html = renderToStaticMarkup(
    await PluginInstallUsage({ plugin: "codezen" }),
  );
  expect(html).toContain(">1</strong>");
  expect(html).toContain("install reported by Codex");
  expect(html).not.toContain("through Korza CLI");
  expect(html).not.toContain("reported by Claude Code");
  expect(html).not.toContain("These counts can overlap");
});

it("keeps native and Korza Codex reports distinct", async () => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(true);
  mocks.installs.mockResolvedValue({ codexNative: 2, codexKorza: 3 });
  const html = renderToStaticMarkup(
    await PluginInstallUsage({ plugin: "codezen" }),
  );
  expect(html).toContain(">2</strong>");
  expect(html).toContain("installs reported by Codex");
  expect(html).toContain(">3</strong>");
  expect(html).toContain("Codex installs through Korza CLI");
  expect(html).not.toContain(">5</strong>");
  expect(html).toContain("These counts can overlap");
});

it("shows Claude native and Korza counts independently without a combined total", async () => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(true);
  mocks.installs.mockResolvedValue({ claudeNative: 4, claudeKorza: 3 });
  const html = renderToStaticMarkup(
    await PluginInstallUsage({ plugin: "humanizer" }),
  );
  expect(html).toContain(">4</strong>");
  expect(html).toContain(">3</strong>");
  expect(html).not.toContain(">7</strong>");
  expect(html).toContain("reported by Claude Code");
  expect(html).toContain("Claude Code installs through Korza CLI");
  expect(html).toContain("These counts can overlap");
});
it("shows the Korza-only Claude count when native reporting is unavailable", async () => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(true);
  mocks.installs.mockResolvedValue({ claudeKorza: 1 });
  const html = renderToStaticMarkup(
    await PluginInstallUsage({ plugin: "humanizer" }),
  );
  expect(html).toContain(">1</strong>");
  expect(html).toContain("Claude Code install through Korza CLI");
  expect(html).not.toContain("reported by Claude Code");
});

it("renders exact large installation counts without rounding or combining sources", async () => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(true);
  mocks.installs.mockResolvedValue({
    claudeNative: "9007199254740993",
    claudeKorza: "9007199254740992",
    codexKorza: 1,
  });
  const html = renderToStaticMarkup(
    await PluginInstallUsage({ plugin: "superpowers" }),
  );
  expect(html).toContain(">9007199254740993</strong>");
  expect(html).toContain(">9007199254740992</strong>");
  expect(html).toContain("Claude Code installs through Korza CLI");
  expect(html).toContain("Codex install through Korza CLI");
  expect(html).toContain("These counts can overlap");
});
