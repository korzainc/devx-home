import { describe, expect, it } from "vitest";
import { CATEGORIES, plugins, skills, skillsForPlugin } from "./catalogue";

// The skill list is data and its failures are quiet: an orphan filter nobody can clear, or one
// card silently swallowing another.
describe("skill catalogue", () => {
  it("has no duplicate skill ids", () => {
    const ids = skills.map((skill) => skill.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Names are deliberately not unique: two plugins each claim `tdd`, which is the overlap the
  // catalogue exists to surface. This pins the id scheme that makes that representable.
  it("keys every id on plugin and path, not plugin and name", () => {
    for (const skill of skills) {
      expect(skill.id, `${skill.id} is not plugin:path`).toBe(
        `${skill.plugin}:${skill.path}`,
      );
    }
  });

  it("only attributes skills to plugins in the catalogue", () => {
    const known = new Set(plugins.map((plugin) => plugin.id));
    for (const skill of skills) {
      expect(
        known.has(skill.plugin),
        `${skill.id} belongs to unknown plugin ${skill.plugin}`,
      ).toBe(true);
    }
  });

  it("gives every skill the fields a card renders", () => {
    for (const skill of skills) {
      expect(skill.name, `${skill.id} has no name`).toBeTruthy();
      expect(skill.summary, `${skill.id} has no summary`).toBeTruthy();
      expect(skill.agents.length, `${skill.id} has no agents`).toBeGreaterThan(
        0,
      );
    }
  });

  // humanizer's description is a block scalar: a single-line reader captures the literal "|",
  // which is truthy and renders as a blank card.
  it("gives every skill a summary a human can read", () => {
    for (const skill of skills) {
      expect(
        skill.summary.length,
        `${skill.id} summary is too short to be real: ${JSON.stringify(skill.summary)}`,
      ).toBeGreaterThan(20);

      expect(
        skill.summary.split(/\s+/).length,
        `${skill.id} summary is not a sentence: ${JSON.stringify(skill.summary)}`,
      ).toBeGreaterThan(3);

      expect(
        /^[|>]/.test(skill.summary),
        `${skill.id} summary starts with a YAML block scalar marker, so the parser kept the marker instead of the value`,
      ).toBe(false);
    }
  });

  it("only uses origins the plugin catalogue also uses", () => {
    const known = new Set(plugins.map((plugin) => plugin.origin));
    for (const skill of skills) {
      expect(
        known.has(skill.origin),
        `${skill.id} claims unknown origin ${skill.origin}`,
      ).toBe(true);
    }
  });

  it("agrees with the plugin it came from about which agents can run it", () => {
    for (const skill of skills) {
      const parent = plugins.find((plugin) => plugin.id === skill.plugin);
      expect(parent).toBeDefined();
      expect(
        [...skill.agents].sort(),
        `${skill.id} disagrees with ${skill.plugin} about agents`,
      ).toEqual([...parent!.agents].sort());
    }
  });

  it("finds the skills a plugin ships", () => {
    // codezen is the case the hand-maintained plugins.json got wrong: it listed zero.
    expect(skillsForPlugin("codezen").length).toBeGreaterThan(0);
    expect(skillsForPlugin("not-a-plugin")).toHaveLength(0);
  });

  it("classifies every skill", () => {
    // An empty string renders as a blank chip; an unclassifiable skill needs a named value.
    for (const skill of skills) {
      expect(skill.category, `${skill.id} has no category`).toBeTruthy();
    }
  });

  it("gives every skill jobs a user could search for", () => {
    // A skill with no jobs is reachable only by someone who already knows its name.
    for (const skill of skills) {
      expect(skill.jobs.length, `${skill.id} has no jobs`).toBeGreaterThan(0);
      for (const job of skill.jobs) {
        expect(job.trim(), `${skill.id} has a blank job`).toBeTruthy();
      }
    }
  });

  it("only uses categories CATEGORIES defines", () => {
    const allowed = new Set<string>(CATEGORIES);
    for (const skill of skills) {
      expect(
        allowed.has(skill.category),
        `${skill.id}: ${skill.category}`,
      ).toBe(true);
    }
  });

  it("keeps setup and meta skills out of the default browse", () => {
    // If this reaches zero, `kind` has stopped doing anything and should go.
    const hidden = skills.filter((skill) => skill.kind !== "skill");
    expect(hidden.length).toBeGreaterThan(0);
    for (const skill of hidden) {
      expect(["setup", "meta"]).toContain(skill.kind);
    }
  });

  it("does not carry a field that restates origin", () => {
    // `owner` partitioned all 57 rows 40/17, the same split as `origin`. Removed, not rendered.
    for (const skill of skills) {
      expect(skill).not.toHaveProperty("owner");
    }
    expect(skills.some((skill) => skill.ownerTeam === null)).toBe(true);
  });

  // Discover holds two rows: the catalogue is engineering-only. A finding, not a bug.
  it("puts at least one skill in every category", () => {
    for (const category of CATEGORIES) {
      expect(
        skills.filter((skill) => skill.category === category).length,
        `nothing is classified ${category}`,
      ).toBeGreaterThan(0);
    }
  });

  it("marks every skill either Live or Planned", () => {
    for (const skill of skills) {
      expect(["Live", "Planned"]).toContain(skill.status);
    }
    // DX-22 is six document formats, none of them built.
    expect(skills.filter((skill) => skill.status === "Planned")).toHaveLength(
      6,
    );
  });
});
