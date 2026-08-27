/** Query matching for the catalogue grid. Here, not inline, so the tests exercise it. */

/** Collapse separators so `test-driven-development` reads as three words. */
function flatten(value: string): string {
  return value.toLowerCase().replace(/[-_/:]+/g, " ");
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
export function matchesTerm(term: string, word: string): boolean {
  if (word.startsWith(term)) return true;
  return word.length >= MIN_STEM && term.startsWith(word);
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
