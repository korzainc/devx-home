"use client";

import { useMemo, useState, type ReactNode } from "react";
import { facetValues, type CatalogueEntry, type Facet } from "@/lib/catalogue";

type CatalogueGridProps<T extends CatalogueEntry> = {
  entries: T[];
  facets: Facet<T>[];
  renderCard: (entry: T) => ReactNode;
  searchLabel: string;
};

export function CatalogueGrid<T extends CatalogueEntry>({
  entries,
  facets,
  renderCard,
  searchLabel,
}: CatalogueGridProps<T>) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  const facetOptions = useMemo(
    () =>
      facets.map((facet) => {
        const counts = new Map<string, number>();
        for (const entry of entries) {
          for (const value of facetValues(entry, facet.key)) {
            counts.set(value, (counts.get(value) ?? 0) + 1);
          }
        }
        return {
          ...facet,
          options: [...counts].sort((a, b) => a[0].localeCompare(b[0])),
        };
      }),
    [entries, facets],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const matchesFacets = facets.every((facet) => {
        const picked = selected[facet.key];
        if (!picked?.length) return true;
        const values = facetValues(entry, facet.key);
        return picked.some((value) => values.includes(value));
      });
      if (!matchesFacets) return false;
      if (!needle) return true;
      const haystack = [
        entry.name,
        entry.summary,
        ...facets.flatMap((facet) => facetValues(entry, facet.key)),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [entries, facets, query, selected]);

  const activeCount = Object.values(selected).reduce(
    (total, picked) => total + picked.length,
    0,
  );

  function toggle(key: string, value: string) {
    setSelected((previous) => {
      const picked = previous[key] ?? [];
      return {
        ...previous,
        [key]: picked.includes(value)
          ? picked.filter((entry) => entry !== value)
          : [...picked, value],
      };
    });
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
      <aside className="flex shrink-0 flex-col gap-6 lg:sticky lg:top-24 lg:w-56">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="catalogue-search"
            className="text-xs font-medium tracking-wide text-ink-faint uppercase"
          >
            Search
          </label>
          <input
            id="catalogue-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchLabel}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
          />
        </div>

        {facetOptions.map((facet) => (
          <fieldset key={facet.key} className="flex flex-col gap-2">
            <legend className="mb-2 text-xs font-medium tracking-wide text-ink-faint uppercase">
              {facet.label}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {facet.options.map(([value, count]) => {
                const isOn = selected[facet.key]?.includes(value) ?? false;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={isOn}
                    onClick={() => toggle(facet.key, value)}
                    className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                      isOn
                        ? "border-accent bg-accent-wash text-ink"
                        : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
                    }`}
                  >
                    {value}
                    <span className="font-mono text-[0.65rem] text-ink-faint">
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <span>
            <span className="font-mono text-ink">{visible.length}</span> of{" "}
            <span className="font-mono">{entries.length}</span>
          </span>
          {(activeCount > 0 || query) && (
            <button
              type="button"
              onClick={() => {
                setSelected({});
                setQuery("");
              }}
              className="text-accent hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {visible.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-ink-muted">
            Nothing matches those filters.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((entry) => (
              // The id makes each card an anchor target, which is what a gap in the analysis
              // report links to. It resolves in the unfiltered default state.
              <div key={entry.id} id={entry.id} className="scroll-mt-24">
                {renderCard(entry)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
