/** Here, not inline in the grid, so the tests exercise the real rule. */

function flatten(value: string): string {
  return value.toLowerCase();
}

/** Split like the haystack, or punctuation stays glued and `tdd,` matches nothing. */
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

const MIN_STEM = 4;

/**
 * The word is a prefix of the term, or starts it with an inflection as the remainder: `review`
 * finds `reviewer`, `testing` finds `test`. Anchored at a word start, or `unit` hits
 * "opportunities".
 */
const SUFFIXES = new Set([
  "s",
  "es",
  "ed",
  "d",
  "er",
  "r",
  "ers",
  "rs",
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
  // Without this `when` matched 33 of 57 rows through `whenever`.
  const rest = term.slice(word.length);
  return (
    SUFFIXES.has(rest) ||
    (rest[0] === word.at(-1) && SUFFIXES.has(rest.slice(1)))
  );
}

export function matchesQuery(query: string, haystack: string): boolean {
  const needles = terms(query);
  if (!needles.length) return true;
  const hay = words(haystack);
  return needles.every((term) => hay.some((word) => matchesTerm(term, word)));
}

/** Facet values excluded: every skill carries "Claude Code", which put `code` in every row. */
export function entryHaystack(entry: {
  name: string;
  summary: string | null;
  description?: string;
  jobs?: string[];
}): string {
  // Upstream's wording stays searchable even though the card shows ours.
  return [entry.name, entry.summary, entry.description, entry.jobs?.join(" ")]
    .filter(Boolean)
    .join(" ");
}
