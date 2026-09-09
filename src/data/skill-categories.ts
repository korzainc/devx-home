/**
 * Which kind of thinking each skill is, authored here rather than synced.
 *
 * `skills.json` arrives from korzainc/marketplace carrying its own `category`, so this overlay
 * replaces a generated field rather than adding a missing one. Editing the index directly would
 * last until the next sync; this survives it, the way `skill-audiences.ts` does.
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

/** Read when the overlay does not name an id, which today only a Planned skill going Live can
 *  cause. "Make" rather than a section of its own: an unplaced row still has to appear somewhere a
 *  reader can find it, and the seam test beside this file is what fails either way. */
export const CATEGORY_FALLBACK: SkillCategory = "Make";

/**
 * Every live skill, keyed by id because `tdd` and `code-review` each name two.
 *
 * Setup and meta rows are classified too, even though they render in their own collapsed section
 * and never reach a heading: they carry a category upstream, and leaving them on the old taxonomy
 * would mean two vocabularies in one file.
 */
export const skillCategories: Record<string, SkillCategory> = {
  // codezen
  "codezen:skills/agentic-e2e": "Pressure-test",
  "codezen:skills/brainstorm": "Decide",
  "codezen:skills/code-review": "Pressure-test",
  "codezen:skills/fix": "Make",
  "codezen:skills/noc-fix": "Make",
  "codezen:skills/noc-tdd": "Make",
  "codezen:skills/security-review": "Pressure-test",
  "codezen:skills/setup": "Make", // setup
  "codezen:skills/sut-bootstrap": "Make", // setup
  "codezen:skills/tdd": "Make",
  "codezen:skills/to-notion": "Hand over",

  // humanizer
  "humanizer:.": "Make",

  // mattpocock-skills
  "mattpocock-skills:skills/engineering/ask-matt": "Understand", // meta
  "mattpocock-skills:skills/engineering/code-review": "Pressure-test",
  "mattpocock-skills:skills/engineering/codebase-design": "Understand",
  "mattpocock-skills:skills/engineering/diagnosing-bugs": "Understand",
  "mattpocock-skills:skills/engineering/domain-modeling": "Understand",
  "mattpocock-skills:skills/engineering/grill-with-docs": "Pressure-test",
  "mattpocock-skills:skills/engineering/implement": "Make",
  "mattpocock-skills:skills/engineering/improve-codebase-architecture":
    "Understand",
  "mattpocock-skills:skills/engineering/prototype": "Decide",
  "mattpocock-skills:skills/engineering/research": "Understand",
  "mattpocock-skills:skills/engineering/resolving-merge-conflicts": "Make",
  "mattpocock-skills:skills/engineering/setup-matt-pocock-skills": "Make", // setup
  "mattpocock-skills:skills/engineering/tdd": "Make",
  "mattpocock-skills:skills/engineering/to-spec": "Make",
  "mattpocock-skills:skills/engineering/to-tickets": "Hand over",
  "mattpocock-skills:skills/engineering/triage": "Hand over",
  "mattpocock-skills:skills/engineering/wayfinder": "Decide",
  "mattpocock-skills:skills/engineering/wizard": "Make",
  "mattpocock-skills:skills/productivity/grill-me": "Pressure-test",
  "mattpocock-skills:skills/productivity/grilling": "Pressure-test",
  "mattpocock-skills:skills/productivity/handoff": "Hand over",
  "mattpocock-skills:skills/productivity/teach": "Understand", // meta
  "mattpocock-skills:skills/productivity/to-questionnaire": "Hand over",
  "mattpocock-skills:skills/productivity/wait-what": "Hand over", // meta
  "mattpocock-skills:skills/productivity/writing-for-agents": "Make", // meta

  // superpowers
  "superpowers:skills/brainstorming": "Decide",
  "superpowers:skills/dispatching-parallel-agents": "Make",
  "superpowers:skills/executing-plans": "Make",
  "superpowers:skills/finishing-a-development-branch": "Hand over",
  "superpowers:skills/receiving-code-review": "Pressure-test",
  "superpowers:skills/requesting-code-review": "Pressure-test",
  "superpowers:skills/subagent-driven-development": "Make",
  "superpowers:skills/systematic-debugging": "Understand",
  "superpowers:skills/test-driven-development": "Make",
  "superpowers:skills/using-git-worktrees": "Hand over",
  "superpowers:skills/using-superpowers": "Understand", // meta
  "superpowers:skills/verification-before-completion": "Pressure-test",
  "superpowers:skills/writing-plans": "Make",
  "superpowers:skills/writing-skills": "Make", // meta
};
