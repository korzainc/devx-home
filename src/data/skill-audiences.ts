/**
 * The audience vocabulary, and who each plugin is for.
 *
 * A skill's audience is its author's: it is declared in their own `SKILL.md`, validated upstream
 * against the same four names below, and arrives in `index.json`. The per-skill overlay that
 * used to sit here is gone.
 *
 * A plugin's is still authored here. Its other fields are generated upstream alongside the
 * skills, but nothing there gives a plugin an audience, so `pluginAudiences` remains the only
 * source and can still drift from the entries it names.
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

/** Read when `pluginAudiences` does not name a plugin, which a new catalogue entry causes. Not
 *  "Engineering": an entry that quietly defaults to the largest audience is hidden from the other
 *  two, and one missing from two thirds of the catalogue is the harder failure to notice. Showing
 *  everywhere is wrong in a way a reader can see, and the seam test fails on the sync that causes
 *  it either way. */
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
