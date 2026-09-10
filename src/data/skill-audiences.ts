/**
 * Who each skill and plugin is for, authored here rather than synced.
 *
 * `skills.json` and `plugins.json` arrive from korzainc/marketplace, and neither carries an
 * audience: upstream classifies by `category` and `kind`, both of which describe the work rather
 * than the reader. This overlay sits beside them and survives the next sync, the way
 * `tool-card-summaries.ts` does for the tools catalogue.
 *
 * The list is expected to grow. Values are written out per entry rather than derived from holding
 * every audience at once, so adding a fourth later does not silently reclassify a row.
 */
export const AUDIENCES = ["Engineering", "Business", "Sales", "All"] as const;

export type Audience = (typeof AUDIENCES)[number];

/** The value that holds for whichever audience was picked, rather than naming a fourth one. Both
 *  catalogue panels and the match rule have to agree on it, so it is named once. */
export const AUDIENCE_ANY: Audience = "All";

/** The query-string key, shared because both panels draw the row and a reader may edit it. */
export const AUDIENCE_PARAM = "for";

/** Read by anything that has to place a row when the overlay does not name it. Not "Engineering":
 *  a skill that quietly defaults to the largest audience is hidden from the other two, and a row
 *  missing from two thirds of the catalogue is the harder failure to notice. Showing everywhere is
 *  wrong in a way a reader can see, and the seam test fails on the sync that causes it either
 *  way. */
export const AUDIENCE_FALLBACK: Audience[] = ["All"];

/**
 * "All" is a value in its own right, not the absence of one: it marks a skill whose subject is the
 * thinking or the writing rather than the code, which someone outside engineering can pick up
 * unchanged. A row carrying it is not also tagged with the specific audiences, so the two never
 * have to be kept in step, and picking Sales unions the All rows in the way picking Go unions in
 * the language-agnostic tools on /tools.
 */
export const skillAudiences: Record<string, Audience[]> = {
  "codezen:skills/agentic-e2e": ["Engineering"],
  "codezen:skills/brainstorm": ["All"],
  "codezen:skills/code-review": ["Engineering"],
  "codezen:skills/fix": ["Engineering"],
  "codezen:skills/noc-fix": ["Engineering"],
  "codezen:skills/noc-tdd": ["Engineering"],
  "codezen:skills/security-review": ["Engineering"],
  "codezen:skills/setup": ["Engineering"],
  "codezen:skills/sut-bootstrap": ["Engineering"],
  "codezen:skills/tdd": ["Engineering"],
  "codezen:skills/to-notion": ["All"],
  "humanizer:.": ["All"],
  "mattpocock-skills:skills/engineering/ask-matt": ["Engineering"],
  "mattpocock-skills:skills/engineering/code-review": ["Engineering"],
  "mattpocock-skills:skills/engineering/codebase-design": ["Engineering"],
  "mattpocock-skills:skills/engineering/diagnosing-bugs": ["Engineering"],
  "mattpocock-skills:skills/engineering/domain-modeling": ["Engineering"],
  "mattpocock-skills:skills/engineering/grill-with-docs": ["Engineering"],
  "mattpocock-skills:skills/engineering/implement": ["Engineering"],
  "mattpocock-skills:skills/engineering/improve-codebase-architecture": [
    "Engineering",
  ],
  "mattpocock-skills:skills/engineering/prototype": ["Engineering"],
  "mattpocock-skills:skills/engineering/research": ["All"],
  "mattpocock-skills:skills/engineering/resolving-merge-conflicts": [
    "Engineering",
  ],
  "mattpocock-skills:skills/engineering/setup-matt-pocock-skills": [
    "Engineering",
  ],
  "mattpocock-skills:skills/engineering/tdd": ["Engineering"],
  "mattpocock-skills:skills/engineering/to-spec": ["All"],
  // Both write to the issue tracker, which is where a backlog is run from as much as built from.
  "mattpocock-skills:skills/engineering/to-tickets": [
    "Engineering",
    "Business",
  ],
  "mattpocock-skills:skills/engineering/triage": ["Engineering", "Business"],
  "mattpocock-skills:skills/engineering/wayfinder": ["Engineering"],
  "mattpocock-skills:skills/engineering/wizard": ["Engineering"],
  "mattpocock-skills:skills/productivity/grill-me": ["All"],
  "mattpocock-skills:skills/productivity/grilling": ["All"],
  "mattpocock-skills:skills/productivity/handoff": ["All"],
  // Teaches from the code in front of you, so the code is the subject and not just the setting.
  "mattpocock-skills:skills/productivity/teach": ["Engineering"],
  // Turns a question you cannot answer into one someone else fills in, which is the shape of a
  // discovery call as much as an internal decision.
  "mattpocock-skills:skills/productivity/to-questionnaire": [
    "Sales",
    "Business",
  ],
  "mattpocock-skills:skills/productivity/wait-what": ["All"],
  "mattpocock-skills:skills/productivity/writing-for-agents": ["All"],
  "superpowers:skills/brainstorming": ["All"],
  "superpowers:skills/dispatching-parallel-agents": ["Engineering"],
  "superpowers:skills/executing-plans": ["Engineering"],
  "superpowers:skills/finishing-a-development-branch": ["Engineering"],
  "superpowers:skills/receiving-code-review": ["Engineering"],
  "superpowers:skills/requesting-code-review": ["Engineering"],
  "superpowers:skills/subagent-driven-development": ["Engineering"],
  "superpowers:skills/systematic-debugging": ["Engineering"],
  "superpowers:skills/test-driven-development": ["Engineering"],
  "superpowers:skills/using-git-worktrees": ["Engineering"],
  // Routes within a collection that is almost entirely engineering, so it inherits that reach
  // rather than the neutrality of "find the right skill" read on its own.
  "superpowers:skills/using-superpowers": ["Engineering"],
  "superpowers:skills/verification-before-completion": ["Engineering"],
  "superpowers:skills/writing-plans": ["All"],
  "superpowers:skills/writing-skills": ["All"],
};

/** A plugin is read from the skills it bundles, so a mixed one carries each audience it serves
 *  rather than collapsing to "All": the reader picking Sales wants the two entries that hold
 *  something for them, not the four that hold something for someone. */
export const pluginAudiences: Record<string, Audience[]> = {
  codezen: ["Engineering"],
  humanizer: ["All"],
  "mattpocock-skills": ["Engineering", "Business", "Sales"],
  superpowers: ["Engineering"],
};
