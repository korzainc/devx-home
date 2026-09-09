import { describe, expect, it } from "vitest";
import {
  AUDIENCES,
  pluginAudiences,
  skillAudiences,
  type Audience,
} from "@/data/skill-audiences";
import { browsableSkills, plugins, toolchainSkills } from "@/lib/catalogue";

// The overlay is hand-authored beside a generated index, so it can only drift one of two ways: a
// sync adds an entry nobody has classified, or it drops one the overlay still names. Both are
// silent at runtime, since an unknown id falls back rather than throwing. These are the tests that
// are not.
describe("skill audiences", () => {
  it("covers every browsable skill", () => {
    const missing = browsableSkills
      .filter((skill) => !skillAudiences[skill.id])
      .map((skill) => skill.id);
    expect(missing).toEqual([]);
  });

  it("has no entry for a skill the catalogue dropped", () => {
    // Toolchain rows are listed but never faceted, so classifying one would be dead weight.
    const real = new Set(browsableSkills.map((skill) => skill.id));
    const stale = Object.keys(skillAudiences).filter((id) => !real.has(id));
    expect(stale).toEqual([]);
  });

  it("does not classify the toolchain rows, which sit outside every filter", () => {
    const classified = toolchainSkills.filter(
      (skill) => skillAudiences[skill.id],
    );
    expect(classified).toEqual([]);
  });

  it("covers every plugin", () => {
    const missing = plugins
      .filter((plugin) => !pluginAudiences[plugin.id])
      .map((plugin) => plugin.id);
    expect(missing).toEqual([]);
  });

  it("has no entry for a plugin the catalogue dropped", () => {
    const real = new Set(plugins.map((plugin) => plugin.id));
    const stale = Object.keys(pluginAudiences).filter((id) => !real.has(id));
    expect(stale).toEqual([]);
  });

  it("only uses audiences the chip row can draw", () => {
    const known: string[] = [...AUDIENCES];
    const values = [
      ...Object.values(skillAudiences),
      ...Object.values(pluginAudiences),
    ].flat();
    expect(values.filter((value) => !known.includes(value))).toEqual([]);
  });

  it("never pairs All with a specific audience", () => {
    // "All" already holds for each of them, so the pair says nothing the shorter tag does not,
    // and the two would then have to be kept in step as the list grows.
    const both = Object.entries({ ...skillAudiences, ...pluginAudiences })
      .filter(([, values]) => values.includes("All") && values.length > 1)
      .map(([id]) => id);
    expect(both).toEqual([]);
  });

  it("tags every entry with at least one audience", () => {
    const empty = Object.entries({ ...skillAudiences, ...pluginAudiences })
      .filter(([, values]) => values.length === 0)
      .map(([id]) => id);
    expect(empty).toEqual([]);
  });

  it("reaches every skill from some chip, so no row is unreachable", () => {
    // Picking each audience in turn has to account for all 42: a row tagged with nothing the row
    // draws would sit in the grid unfiltered and vanish the moment anyone touched the filter.
    const reachable = new Set<string>();
    for (const audience of AUDIENCES) {
      for (const skill of browsableSkills) {
        const mine = skillAudiences[skill.id] as Audience[];
        if (mine.includes(audience) || mine.includes("All")) {
          reachable.add(skill.id);
        }
      }
    }
    expect(reachable.size).toBe(browsableSkills.length);
  });
});
