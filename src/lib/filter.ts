import { AUDIENCE_ANY, type Audience } from "@/data/skill-audiences";
import {
  facetValues,
  type CatalogueEntry,
  type Facet,
} from "@/lib/catalogue-entries";
import { entryHaystack, matchesQuery } from "@/lib/search";

/**
 * Audience is a union rather than an intersection, so it cannot go through the generic facet path
 * in `filterEntries`: a row tagged "All" is not a fourth audience sitting beside the others, it is
 * one that holds for whichever of them the reader picked. Exact-matching would drop every
 * cross-functional skill out of a Sales view and leave a single card behind.
 *
 * One pass over one list, so a row matching two of the picked audiences is still returned once.
 */
export function matchesAudience(
  entry: { audiences: Audience[] },
  picked: string[],
): boolean {
  if (picked.length === 0) return true;
  return (
    entry.audiences.some((value) => picked.includes(value)) ||
    // Not when "All" is itself the pick: someone asking for the cross-functional rows is asking
    // to see fewer, and every row would satisfy this.
    (!picked.includes(AUDIENCE_ANY) && entry.audiences.includes(AUDIENCE_ANY))
  );
}

/**
 * One comma-separated query param, split. Whether a value names something real is decided by the
 * catalogue component, which is the side holding the list; anything else is dropped there rather
 * than filtered on.
 *
 * A repeated key arrives as an array and is ignored, so `?stack=go&stack=java` reads as no pick at
 * all instead of silently honouring one of the two.
 */
export function parseFilterParam(
  value: string | string[] | undefined,
): string[] {
  if (typeof value !== "string" || value.length === 0) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Here so the tests and the grid run one copy of the rule.
 *
 * Sidebar facet counts are deliberately unconditioned: a count that collapses as you filter
 * cannot tell you what is available to filter back to.
 */
export function filterEntries<T extends CatalogueEntry>({
  entries,
  facets,
  selected,
  query,
}: {
  entries: T[];
  facets: Facet<T>[];
  selected: Record<string, string[]>;
  query: string;
}): T[] {
  return entries.filter((entry) => {
    const matchesFacets = facets.every((facet) => {
      const picked = selected[facet.key];
      if (!picked?.length) return true;
      const values = facetValues(entry, facet.key);
      return picked.some((value) => values.includes(value));
    });
    if (!matchesFacets) return false;

    return matchesQuery(query, entryHaystack(entry));
  });
}
