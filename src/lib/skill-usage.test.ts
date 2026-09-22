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
  query.mockResolvedValue({ rows: [{ count: "4" }] });
  expect(await readPluginInstalls("humanizer")).toBe(4);
  expect(query.mock.calls[0][0].values).toEqual(["humanizer"]);
  expect(query.mock.calls[0][0].text).toContain("kind='plugin_installed'");
});
it("omits zero or invalid install totals", async () => {
  for (const count of ["0", "-1", "invalid"]) {
    query.mockResolvedValue({ rows: [{ count }] });
    expect(await readPluginInstalls("humanizer")).toBeUndefined();
  }
});
