import {
  facetValues,
  type CatalogueEntry,
  type Facet,
} from "@/lib/catalogue-entries";
import { entryHaystack, matchesQuery } from "@/lib/search";

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
