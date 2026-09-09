import { describe, expect, it } from "vitest";
import { skillFacets, skills, type SkillEntry } from "./catalogue";
import { filterEntries } from "./filter";

type State = { selected: Record<string, string[]>; query: string };

function view(state: State, entries: SkillEntry[] = skills): SkillEntry[] {
  return filterEntries({
    entries,
    facets: skillFacets,
    selected: state.selected,
    query: state.query,
  });
}

describe("grid filtering", () => {
  it("returns everything with no query and no facets", () => {
    expect(view({ selected: {}, query: "" })).toHaveLength(skills.length);
  });

  it("treats an empty facet array as no filter", () => {
    expect(view({ selected: { plugin: [] }, query: "" })).toHaveLength(
      skills.length,
    );
  });

  it("ORs within a facet and ANDs across facets", () => {
    // Plugin, because a skill carries exactly one, so the two counts cannot overlap and their
    // sum is the answer OR has to give.
    const korza = view({ selected: { plugin: ["codezen"] }, query: "" }).length;
    const third = view({
      selected: { plugin: ["superpowers"] },
      query: "",
    }).length;
    const either = view({
      selected: { plugin: ["codezen", "superpowers"] },
      query: "",
    }).length;
    expect(korza).toBeGreaterThan(0);
    expect(third).toBeGreaterThan(0);
    expect(either).toBe(korza + third);

    const andOrigin = view({
      selected: { plugin: ["codezen", "superpowers"], origin: ["Korza"] },
      query: "",
    }).length;
    expect(andOrigin).toBeLessThan(either);
  });

  it("applies the query, not only the facets", () => {
    const all = view({ selected: {}, query: "" }).length;
    const queried = view({ selected: {}, query: "pull request" });
    expect(queried.length).toBeGreaterThan(0);
    expect(queried.length).toBeLessThan(all);
  });

  it("matches a list-valued facet against any of its values", () => {
    const codex = view({ selected: { agents: ["Codex CLI"] }, query: "" });
    expect(codex.length).toBeGreaterThan(0);
    for (const skill of codex) expect(skill.agents).toContain("Codex CLI");
  });

  // Not every value: every skill runs on Claude Code. A facet where EVERY value covers everything
  // is not a control.
  it("gives every facet values that each match something and one that narrows", () => {
    for (const facet of skillFacets) {
      const values = new Set(
        skills.flatMap((skill) => {
          const value = skill[facet.key as keyof SkillEntry];
          return Array.isArray(value) ? value : [String(value)];
        }),
      );
      expect(values.size, `${facet.key} has one value`).toBeGreaterThan(1);

      const sizes = [...values].map((value) => ({
        value,
        size: view({ selected: { [facet.key]: [value] }, query: "" }, skills)
          .length,
      }));

      for (const { value, size } of sizes) {
        expect(size, `${facet.key}=${value} matches nothing`).toBeGreaterThan(
          0,
        );
      }
      expect(
        sizes.some(({ size }) => size < skills.length),
        `no value of ${facet.key} narrows the grid`,
      ).toBe(true);
    }
  });
});

describe("the two kinds of row", () => {
  it("carries a kind on every row, and setup and meta are real values", () => {
    // The catalogue no longer splits on this, but the grid sorts on it and the card marks it,
    // so a sync that drops the field would silently unmark every setup row.
    const kinds = new Set(skills.map((skill) => skill.kind));
    expect([...kinds].sort()).toEqual(["meta", "setup", "skill"]);
  });

  it("gives the setup and meta rows the values every facet is built from", () => {
    // The reason they could be folded in: origin, plugin and agents were always on them. A sync
    // that leaves one blank puts a row behind a facet value no menu draws.
    for (const skill of skills.filter((entry) => entry.kind !== "skill")) {
      for (const facet of skillFacets) {
        const value = skill[facet.key as keyof SkillEntry];
        expect(
          Array.isArray(value) ? value.length > 0 : Boolean(value),
          `${skill.id} has no ${facet.key}`,
        ).toBe(true);
      }
    }
  });
});
