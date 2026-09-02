import { describe, expect, it } from "vitest";
import {
  browsableSkills,
  skillFacets,
  skills,
  toolchainSkills,
  type SkillEntry,
} from "./catalogue";
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
    expect(view({ selected: { category: [] }, query: "" })).toHaveLength(
      skills.length,
    );
  });

  it("ORs within a facet and ANDs across facets", () => {
    const build = view({ selected: { category: ["Build"] }, query: "" }).length;
    const verify = view({
      selected: { category: ["Verify"] },
      query: "",
    }).length;
    const either = view({
      selected: { category: ["Build", "Verify"] },
      query: "",
    }).length;
    expect(either).toBe(build + verify);

    const andOrigin = view({
      selected: { category: ["Build", "Verify"], origin: ["Korza"] },
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
        browsableSkills.flatMap((skill) => {
          const value = skill[facet.key as keyof SkillEntry];
          return Array.isArray(value) ? value : [String(value)];
        }),
      );
      expect(values.size, `${facet.key} has one value`).toBeGreaterThan(1);

      const sizes = [...values].map((value) => ({
        value,
        size: view(
          { selected: { [facet.key]: [value] }, query: "" },
          browsableSkills,
        ).length,
      }));

      for (const { value, size } of sizes) {
        expect(size, `${facet.key}=${value} matches nothing`).toBeGreaterThan(
          0,
        );
      }
      expect(
        sizes.some(({ size }) => size < browsableSkills.length),
        `no value of ${facet.key} narrows the grid`,
      ).toBe(true);
    }
  });
});

describe("the two populations", () => {
  it("splits the index in two and loses nothing", () => {
    expect(browsableSkills.length + toolchainSkills.length).toBe(skills.length);
    expect(
      [...browsableSkills, ...toolchainSkills].map((s) => s.id).sort(),
    ).toEqual(skills.map((s) => s.id).sort());
  });

  it("classifies by kind, with setup and meta on the unfaceted side", () => {
    for (const skill of browsableSkills) expect(skill.kind).toBe("skill");
    expect(toolchainSkills.length).toBeGreaterThan(0);
    for (const skill of toolchainSkills) {
      expect(["setup", "meta"]).toContain(skill.kind);
    }
  });

  // A Category count including three ways of installing things describes the catalogue.
  it("keeps toolchain rows out of every facet count", () => {
    for (const facet of skillFacets) {
      const options = new Set(
        browsableSkills.flatMap((skill) => {
          const value = skill[facet.key as keyof SkillEntry];
          return Array.isArray(value) ? value : [String(value)];
        }),
      );
      for (const value of options) {
        const shown = view(
          { selected: { [facet.key]: [value] }, query: "" },
          browsableSkills,
        );
        for (const skill of shown) expect(skill.kind).toBe("skill");
      }
    }
  });
});
