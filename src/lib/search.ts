/** Query matching for the catalogue grid. Here, not inline, so the tests exercise it. */

function flatten(value: string): string {
  return value.toLowerCase();
}

/** Split the same way the haystack is, or punctuation stays glued and `tdd,` matches nothing. */
export function terms(query: string): string[] {
  return flatten(query)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function words(haystack: string): string[] {
  return flatten(haystack)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Shortest word a query term may be truncated to when matching an inflection. */
const MIN_STEM = 4;

/**
 * Either may be a prefix of the other: `review` finds `reviewer`, and `testing` finds `test`.
 * Anchored at a word start — substring matching made `unit` hit "opportunities".
 */
const SUFFIXES = new Set([
  "s",
  "es",
  "ed",
  "d",
  "er",
  "r",
  "ers",
  "ing",
  "ings",
  "ion",
  "ions",
  "ation",
  "ations",
  "ment",
  "ments",
  "ly",
  "y",
]);

export function matchesTerm(term: string, word: string): boolean {
  if (word.startsWith(term)) return true;
  if (word.length < MIN_STEM || !term.startsWith(word)) return false;
  // The remainder has to be an inflection. Without this, `work` swallowed `worktree`,
  // `workflow` and `workspace`, and `when` matched 33 of 57 rows through `whenever`.
  const rest = term.slice(word.length);
  return (
    SUFFIXES.has(rest) ||
    (rest[0] === word.at(-1) && SUFFIXES.has(rest.slice(1)))
  );
}

/** True when every term in the query matches some word in the haystack. */
export function matchesQuery(query: string, haystack: string): boolean {
  const needles = terms(query);
  if (!needles.length) return true;
  const hay = words(haystack);
  return needles.every((term) => hay.some((word) => matchesTerm(term, word)));
}

/**
 * Facet values are excluded: every skill carries "Claude Code", so including them put `code` in
 * every haystack and `codebase` matched all 57 rows.
 */
export function entryHaystack(entry: {
  name: string;
  summary: string;
  jobs?: string[];
}): string {
  return `${entry.name} ${entry.summary} ${entry.jobs?.join(" ") ?? ""}`;
}
