import { afterEach, expect, it, vi } from "vitest";
import { readPluginInstalls, readSkillUsage } from "./skill-usage";
const query = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getPool: () => ({ query }) }));
afterEach(() => query.mockReset());
it("keeps clients separate and maps exact catalogue names", async () => {
  query
    .mockResolvedValueOnce({
      rows: [
        { skill: "verification-before-completion", count: "2" },
        { skill: "other", count: "99" },
      ],
    })
    .mockResolvedValueOnce({
      rows: [
        { skill: "superpowers_verification-before-completion", count: "3" },
        { skill: "codezen_verification-before-completion", count: "99" },
      ],
    });
  expect(
    await readSkillUsage("superpowers", ["verification-before-completion"]),
  ).toEqual({ "verification-before-completion": { claude: 2, codex: 3 } });
});
it("does not invent zero counts", async () => {
  query.mockResolvedValue({ rows: [] });
  expect(await readSkillUsage("humanizer", ["humanizer"])).toEqual({});
});
it("does not query empty lists", async () => {
  expect(await readSkillUsage("humanizer", [])).toEqual({});
  expect(query).not.toHaveBeenCalled();
});

it("maps the namespaced skill name emitted by real Claude", async () => {
  query
    .mockResolvedValueOnce({
      rows: [{ skill: "humanizer:humanizer", count: "1" }],
    })
    .mockResolvedValueOnce({ rows: [] });
  expect(await readSkillUsage("humanizer", ["humanizer"])).toEqual({
    humanizer: { claude: 1 },
  });
});

it("reads installs for only the requested plugin", async () => {
  query.mockResolvedValue({
    rows: [
      { client: "claude", source: "native_otel", count: "4" },
      { client: "codex", source: "korza_cli", count: "2" },
    ],
  });
  expect(await readPluginInstalls("humanizer")).toEqual({
    claudeNative: 4,
    codexKorza: 2,
  });
  expect(query.mock.calls[0][0].values).toEqual(["humanizer"]);
  expect(query.mock.calls[0][0].text).toContain("kind='plugin_installed'");
});
it("omits zero or invalid install totals", async () => {
  for (const count of ["0", "-1", "invalid"]) {
    query.mockResolvedValue({ rows: [{ client: "claude", count }] });
    expect(await readPluginInstalls("humanizer")).toEqual({});
  }
});

it("binds Codex counts to their plugin while retaining only matching legacy names", async () => {
  query.mockResolvedValue({ rows: [] });
  await readSkillUsage("superpowers", ["brainstorming"]);
  const metrics = query.mock.calls[1][0];
  expect(metrics.values).toEqual([
    "superpowers",
    ["superpowers_brainstorming"],
  ]);
  expect(metrics.text).toContain("(plugin=$1 or plugin is null)");
  expect(metrics.text).toContain("skill=any($2::text[])");
});

it("keeps potentially overlapping native and Korza install counts separate", async () => {
  query.mockResolvedValue({
    rows: [
      { client: "claude", source: "native_otel", count: "4" },
      { client: "claude", source: "korza_cli", count: "3" },
      { client: "codex", source: "korza_cli", count: "2" },
      { client: "codex", source: "native_otel", count: "99" },
      { client: "other", source: "korza_cli", count: "99" },
    ],
  });
  expect(await readPluginInstalls("humanizer")).toEqual({
    claudeNative: 4,
    claudeKorza: 3,
    codexKorza: 2,
  });
  expect(query.mock.calls[0][0].text).toContain("group by client, source");
});
