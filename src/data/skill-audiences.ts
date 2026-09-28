/**
 * Who each skill and plugin is for, authored here rather than synced.
 *
 * `skills.json` arrives from korzainc/marketplace, which generates it; `plugins.json` is
 * hand-authored here. Neither carries an audience: upstream classifies by `category` and `kind`,
 * both of which describe the work rather than the reader. This overlay sits beside them and
 * survives the next sync, the way `tool-card-summaries.ts` does for the tools catalogue.
 *
 * The list is expected to grow. Values are written out per entry rather than derived from holding
 * every audience at once, so adding a fourth later does not silently reclassify a row.
 */
export const AUDIENCES = ["Engineering", "Business", "Sales", "All"] as const;

export type Audience = (typeof AUDIENCES)[number];

/** The value that holds for whichever audience was picked, rather than naming a fourth one. Both
 *  catalogue panels and the match rule have to agree on it, so it is named once. */
export const AUDIENCE_ANY: Audience = "All";

/** Display label only; the stored value stays "All", which beside three roles read as "no filter".
 *  Named for the dimension rather than the breadth, as `/tools` does with "Language-agnostic". */
export const AUDIENCE_ANY_LABEL = "Role-agnostic";

/** The query-string key, shared because both panels draw the row and a reader may edit it. */
export const AUDIENCE_PARAM = "for";

/** Read by anything that has to place a row when the overlay does not name it. Not "Engineering":
 *  a skill that quietly defaults to the largest audience is hidden from the other two, and a row
 *  missing from two thirds of the catalogue is the harder failure to notice. Showing everywhere is
 *  wrong in a way a reader can see, and the seam test fails on the sync that causes it either
 *  way. */
export const AUDIENCE_FALLBACK: Audience[] = ["All"];

/** A plugin is read from the skills it bundles, so a mixed one carries each audience it serves
 *  rather than collapsing to "All": the reader picking Sales wants the two entries that hold
 *  something for them, not the four that hold something for someone. */
export const pluginAudiences: Record<string, Audience[]> = {
  codezen: ["Engineering", "Business"],
  humanizer: ["All"],
  "mattpocock-skills": ["Engineering", "Business", "Sales"],
  superpowers: ["Engineering"],
};
