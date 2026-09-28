import { describe, expect, it } from "vitest";
import { AUDIENCES, pluginAudiences } from "@/data/skill-audiences";
import { plugins, skills } from "@/lib/catalogue";

// `plugins.json` is hand-authored here, so this overlay can still drift: a sync adds a plugin
// nobody has classified, or drops one the overlay still names. Both are silent at runtime.
// Skill audiences arrive from upstream and are checked by `skills-shape` on the way in.
describe("plugin audiences", () => {
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
    const values = Object.values(pluginAudiences).flat();
    expect(values.filter((value) => !known.includes(value))).toEqual([]);
  });

  it("never pairs All with a specific audience", () => {
    // "All" already holds for each of them, so the pair says nothing the shorter tag does not,
    // and the two would then have to be kept in step as the list grows.
    const both = Object.entries(pluginAudiences)
      .filter(([, values]) => values.includes("All") && values.length > 1)
      .map(([id]) => id);
    expect(both).toEqual([]);
  });

  it("tags every plugin with at least one audience", () => {
    const empty = Object.entries(pluginAudiences)
      .filter(([, values]) => values.length === 0)
      .map(([id]) => id);
    expect(empty).toEqual([]);
  });
});

// These hold across the two lists, which no single-row check upstream or here can see.
describe("audiences across plugins and their skills", () => {
  // A plugin card and the skills it bundles are filtered by the same chips, off two separate
  // lists. Where the plugin's list is narrower, the chip surfaces a skill while hiding the
  // plugin that ships it -- a reader who finds the row cannot find what to install.
  it("carries every audience its bundled skills claim", () => {
    const short = plugins
      .map((plugin) => {
        const mine = new Set(pluginAudiences[plugin.id]);
        const bundled = skills
          .filter((skill) => skill.plugin === plugin.id)
          .flatMap((skill) => skill.audiences)
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
    // A row tagged with nothing the chip row draws would sit in the grid unfiltered and vanish
    // the moment anyone touched the filter.
    const reachable = new Set<string>();
    for (const audience of AUDIENCES) {
      for (const skill of skills) {
        if (
          skill.audiences.includes(audience) ||
          skill.audiences.includes("All")
        ) {
          reachable.add(skill.id);
        }
      }
    }
    expect(reachable.size).toBe(skills.length);
  });
});
