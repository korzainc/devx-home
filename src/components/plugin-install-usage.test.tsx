/** @vitest-environment node */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
beforeEach(() => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(true);
});
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
  mocks.installs.mockResolvedValue({ claude: 2, codex: 3 });
  const html = renderToStaticMarkup(
    await PluginInstallUsage({ plugin: "superpowers" }),
  );
  expect(html).toContain("Finding its way into workflows");
  expect(html).toContain(">2</strong>");
  expect(html).toContain("recorded installs via Claude Code");
  expect(html).toContain(">3</strong>");
  expect(html).toContain("recorded installs via Codex");
  expect(html).not.toContain("through Korza CLI");
  expect(html).not.toContain("Self-reported by installations that opted in");
  expect(html).not.toContain("About this count");
  expect(html).not.toContain("These counts can overlap");
  expect(mocks.installs).toHaveBeenCalledWith("superpowers");
});
it("omits unavailable totals without blocking the page", async () => {
  mocks.installs.mockRejectedValue(new Error("offline"));
  expect(await PluginInstallUsage({ plugin: "humanizer" })).toBeNull();
});

it.each([
  ["codex", 1, "install"],
  ["codex", 5, "installs"],
  ["claude", 7, "installs"],
  ["claude", 1, "install"],
])("renders the %s count of %i once", async (client, count, noun) => {
  const [label, other, plugin] =
    client === "codex"
      ? ["Codex", "Claude Code", "codezen"]
      : ["Claude Code", "Codex", "humanizer"];
  mocks.installs.mockResolvedValue({ [client]: count });
  const html = renderToStaticMarkup(await PluginInstallUsage({ plugin }));
  expect(html.match(new RegExp(`>${count}</strong>`, "g"))).toHaveLength(1);
  expect(html).toContain(`recorded ${noun} via ${label}`);
  expect(html).not.toContain(other);
});

it("renders exact large installation counts without rounding or capping", async () => {
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
});

it("omits the widget when neither client has recorded installs", async () => {
  mocks.installs.mockResolvedValue({});
  expect(await PluginInstallUsage({ plugin: "humanizer" })).toBeNull();
});
