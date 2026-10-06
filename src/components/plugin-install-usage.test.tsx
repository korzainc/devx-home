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
it("shows one recorded install figure per client without reporting-source prose", async () => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(true);
  mocks.installs.mockResolvedValue({ claude: 2, codex: 3 });
  const html = renderToStaticMarkup(
    await PluginInstallUsage({ plugin: "superpowers" }),
  );
  expect(html).toContain("Finding its way into workflows");
  expect(html).toContain(">2</strong>");
  expect(html).toContain("recorded installs via Claude Code");
  expect(html).toContain(">3</strong>");
  expect(html).toContain("recorded installs via Codex");
  expect(html).toContain("Claude Code");
  expect(html).toContain("Codex");
  expect(html).not.toContain("through Korza CLI");
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

it("shows a Codex-only total without inventing a Claude count", async () => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(true);
  mocks.installs.mockResolvedValue({ codex: 1 });
  const html = renderToStaticMarkup(
    await PluginInstallUsage({ plugin: "codezen" }),
  );
  expect(html).toContain(">1</strong>");
  expect(html).toContain("recorded install via Codex");
  expect(html).not.toContain("through Korza CLI");
  expect(html).not.toContain("Claude Code");
  expect(html).not.toContain("These counts can overlap");
});

it("renders the combined Codex recorded total once", async () => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(true);
  mocks.installs.mockResolvedValue({ codex: 5 });
  const html = renderToStaticMarkup(
    await PluginInstallUsage({ plugin: "codezen" }),
  );
  expect(html.match(/>5<\/strong>/g)).toHaveLength(1);
  expect(html).toContain("recorded installs via Codex");
  expect(html).not.toContain("These counts can overlap");
});

it("renders the combined Claude recorded total once", async () => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(true);
  mocks.installs.mockResolvedValue({ claude: 7 });
  const html = renderToStaticMarkup(
    await PluginInstallUsage({ plugin: "humanizer" }),
  );
  expect(html.match(/>7<\/strong>/g)).toHaveLength(1);
  expect(html).toContain("recorded installs via Claude Code");
  expect(html).not.toContain("These counts can overlap");
});
it("uses the singular label for one recorded Claude install", async () => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(true);
  mocks.installs.mockResolvedValue({ claude: 1 });
  const html = renderToStaticMarkup(
    await PluginInstallUsage({ plugin: "humanizer" }),
  );
  expect(html).toContain(">1</strong>");
  expect(html).toContain("recorded install via Claude Code");
  expect(html).not.toContain("Codex");
});

it("renders exact large installation counts without rounding or capping", async () => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(true);
  mocks.installs.mockResolvedValue({
    claude: "18014398509481985",
    codex: "9007199254740993",
  });
  const html = renderToStaticMarkup(
    await PluginInstallUsage({ plugin: "superpowers" }),
  );
  expect(html).toContain(">9007199254740993</strong>");
  expect(html).toContain(">18014398509481985</strong>");
  expect(html).toContain("recorded installs via Claude Code");
  expect(html).toContain("recorded installs via Codex");
  expect(html).not.toContain("These counts can overlap");
});

it("omits the widget when neither client has recorded installs", async () => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(true);
  mocks.installs.mockResolvedValue({});
  expect(await PluginInstallUsage({ plugin: "humanizer" })).toBeNull();
});
