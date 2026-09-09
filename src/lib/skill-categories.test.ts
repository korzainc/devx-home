import { describe, expect, it } from "vitest";
import skillsData from "@/data/skills.json";
import { AUDIENCES } from "@/data/skill-audiences";
import {
  CATEGORIES,
  CATEGORY_NOTES,
  skillCategories,
} from "@/data/skill-categories";
import { browsableSkills, skills } from "@/lib/catalogue";
import { matchesAudience } from "@/lib/filter";

// This overlay replaces a field the generator already fills, so it drifts more quietly than one
// that adds a missing field: an id nobody has reclassified does not render blank, it renders under
// the fallback as though someone had chosen it. These are the tests that notice.
describe("skill categories", () => {
  it("covers every live skill, toolchain rows included", () => {
    const missing = skills
      .filter((skill) => !skillCategories[skill.id])
      .map((skill) => skill.id);
    expect(missing).toEqual([]);
  });

  it("has no entry for a skill the index dropped", () => {
    const real = new Set(skills.map((skill) => skill.id));
    const stale = Object.keys(skillCategories).filter((id) => !real.has(id));
    expect(stale).toEqual([]);
  });

  it("only uses values CATEGORIES defines, and writes a note for each", () => {
    const allowed = new Set<string>(CATEGORIES);
    for (const [id, category] of Object.entries(skillCategories)) {
      expect(allowed.has(category), `${id}: ${category}`).toBe(true);
    }
    for (const category of CATEGORIES) {
      expect(CATEGORY_NOTES[category]?.trim(), category).toBeTruthy();
    }
  });

  it("replaces the generator's taxonomy rather than sitting beside it", () => {
    // The merge in catalogue.ts spreads the raw row first and overwrites `category`. Drop that
    // line and every assertion above still passes, because the overlay itself is untouched.
    const upstream = new Set(skillsData.skills.map((skill) => skill.category));
    const rendered = new Set(skills.map((skill) => skill.category));
    expect([...rendered].sort()).toEqual([...CATEGORIES].sort());
    expect(upstream.has("Build")).toBe(true);
    expect(rendered.has("Build" as never)).toBe(false);
  });

  it("puts at least one browsable skill under every heading", () => {
    for (const category of CATEGORIES) {
      const held = browsableSkills.filter(
        (skill) => skill.category === category,
      );
      expect(held.length, `nothing is classified ${category}`).toBeGreaterThan(
        0,
      );
    }
  });

  /**
   * The reason this taxonomy exists, made checkable. "No heading names an activity only engineers
   * do" is the claim; "every audience has rows under every heading" is the version a test can
   * hold. The stage cut it replaced failed this three ways over: Build, Verify and Coordinate had
   * nothing under them for a Sales reader, which is what made the catalogue read as an engineering
   * pipeline with a couple of doors cut into it.
   *
   * This is load-bearing on screen, not just in the data: `/skills` stays grouped while filtering,
   * so a reader who picks Sales sees all five headings with their eleven rows spread across them.
   * Break this and that reader watches a heading disappear. A future skill that does should be
   * reclassified, or the section renamed to something its non-engineering rows can sit under.
   */
  it("leaves no heading empty for any audience", () => {
    for (const audience of AUDIENCES) {
      const visible = browsableSkills.filter((skill) =>
        matchesAudience(skill, [audience]),
      );
      const empty = CATEGORIES.filter(
        (category) => !visible.some((skill) => skill.category === category),
      );
      expect(empty, `${audience} sees no`).toEqual([]);
    }
  });
});
