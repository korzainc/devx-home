import { describe, expect, it } from "vitest";
import {
  AUDIENCES,
  pluginAudiences,
  skillAudiences,
  type Audience,
} from "@/data/skill-audiences";
import { plugins, skills } from "@/lib/catalogue";

// The overlay is hand-authored beside a generated index, so it can only drift one of two ways: a
// sync adds an entry nobody has classified, or it drops one the overlay still names. Both are
// silent at runtime, since an unknown id falls back rather than throwing. These are the tests that
// are not.
describe("skill audiences", () => {
  it("covers every live skill, setup and meta rows included", () => {
    const missing = skills
      .filter((skill) => !skillAudiences[skill.id])
      .map((skill) => skill.id);
    expect(missing).toEqual([]);
  });

  it("has no entry for a skill the catalogue dropped", () => {
    const real = new Set(skills.map((skill) => skill.id));
    const stale = Object.keys(skillAudiences).filter((id) => !real.has(id));
    expect(stale).toEqual([]);
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

  // A plugin card and the skills it bundles are filtered by the same chips, off two separate
  // lists. Where the plugin's list is narrower, the chip surfaces a skill while hiding the
  // plugin that ships it -- a reader who finds the row cannot find what to install.
  it("carries every audience its bundled skills claim", () => {
    const short = plugins
      .map((plugin) => {
        const mine = new Set(pluginAudiences[plugin.id]);
        const bundled = skills
          .filter((skill) => skill.plugin === plugin.id)
          .flatMap((skill) => skillAudiences[skill.id] as Audience[])
          // "All" is not a fourth audience: it already matches every chip but its own, so it
          // says nothing about which of the three the plugin serves.
          .filter((audience) => audience !== "All");
        const uncovered = [...new Set(bundled)].filter(
          (audience) => !mine.has(audience),
        );
        return uncovered.length
          ? `${plugin.id}: ${uncovered.join(", ")}`
          : null;
      })
      .filter(Boolean);
    expect(short).toEqual([]);
  });

  it("reaches every skill from some chip, so no row is unreachable", () => {
    // Picking each audience in turn has to account for all 51: a row tagged with nothing the row
    // draws would sit in the grid unfiltered and vanish the moment anyone touched the filter.
    const reachable = new Set<string>();
    for (const audience of AUDIENCES) {
      for (const skill of skills) {
        const mine = skillAudiences[skill.id] as Audience[];
        if (mine.includes(audience) || mine.includes("All")) {
          reachable.add(skill.id);
        }
      }
    }
    expect(reachable.size).toBe(skills.length);
  });
});
