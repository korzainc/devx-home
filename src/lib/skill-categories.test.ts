import { describe, expect, it } from "vitest";
import { AUDIENCES } from "@/data/skill-audiences";
import { CATEGORIES, CATEGORY_NOTES } from "@/data/skill-categories";
import { skills } from "@/lib/catalogue";
import { matchesAudience } from "@/lib/filter";

// Properties of the rendered catalogue. The values themselves arrive from upstream and are
// checked by `skills-shape` on the way in.
describe("skill categories", () => {
  it("writes a note for every heading", () => {
    for (const category of CATEGORIES) {
      expect(CATEGORY_NOTES[category]?.trim(), category).toBeTruthy();
    }
  });

  it("renders no value CATEGORIES does not define", () => {
    const foreign = [...new Set(skills.map((skill) => skill.category))].filter(
      (category) => !CATEGORIES.includes(category),
    );
    expect(foreign).toEqual([]);
  });

  it("puts at least one skill under every heading", () => {
    for (const category of CATEGORIES) {
      const held = skills.filter((skill) => skill.category === category);
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
   *
   * It is also the one claim no longer enforceable upstream: the generator validates a category
   * per row, not the spread of rows across categories.
   */
  it("leaves no heading empty for any audience", () => {
    for (const audience of AUDIENCES) {
      const visible = skills.filter((skill) =>
        matchesAudience(skill, [audience]),
      );
      const empty = CATEGORIES.filter(
        (category) => !visible.some((skill) => skill.category === category),
      );
      expect(empty, `${audience} sees no`).toEqual([]);
    }
  });
});
