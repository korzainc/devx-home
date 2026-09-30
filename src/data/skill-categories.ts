/**
 * The category vocabulary. Which category a skill is in is its author's, declared in their own
 * `SKILL.md` and validated upstream against this same list; the overlay that used to place every
 * skill here is gone. What stays is the list itself, which the sections are built from and which
 * `skills-shape` checks an arriving row against.
 *
 * The cut is by the kind of thinking a skill is, not by the stage of delivery it belongs to. The
 * stage version named three of its six sections after activities only engineers do, so the
 * headings a Business or Sales reader landed on described a pipeline they had no rows in. Under
 * this cut every audience has rows under every heading, which is the property
 * `skill-categories.test.ts` holds onto.
 */
export const CATEGORIES = [
  "Understand",
  "Decide",
  "Make",
  "Pressure-test",
  "Hand over",
] as const;

export type SkillCategory = (typeof CATEGORIES)[number];

/** One line per section, in CATEGORIES order, which runs the way the work runs rather than by
 *  count. Each is written from the skills the section really holds, not from its own name, and all
 *  five are verb-first so they read as one set. */
export const CATEGORY_NOTES: Record<SkillCategory, string> = {
  Understand: "Works out how something behaves, or why it broke",
  Decide: "Turns a vague idea into something specific enough to act on",
  Make: "Produces the work itself, whether that is code or a document",
  "Pressure-test": "Finds the holes in a plan or a change while they are cheap",
  "Hand over":
    "Passes the work to the person, queue or branch that takes it next",
};
