"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { facetValues, type CatalogueEntry, type Facet } from "@/lib/catalogue";
import { filterEntries } from "@/lib/filter";

type CatalogueGridProps<T extends CatalogueEntry> = {
  entries: T[];
  facets: Facet<T>[];
  renderCard: (entry: T) => ReactNode;
  searchLabel: string;
  /** Singular noun for the rows, used in the empty state. Required, so a caller cannot
   * silently inherit a wrong one. */
  noun: string;
  /**
   * Rows the page lists but does not classify. Search reaches them; facet chips do not, and
   * they contribute nothing to a facet's options or counts.
   */
  unclassified?: T[];
  /** Heading for the unclassified section. */
  unclassifiedLabel?: string;
  /** One line saying why those rows sit apart, shown under the heading. */
  unclassifiedNote?: string;
};

export function CatalogueGrid<T extends CatalogueEntry>({
  entries,
  facets,
  renderCard,
  searchLabel,
  noun,
  unclassified = [],
  unclassifiedLabel,
  unclassifiedNote,
}: CatalogueGridProps<T>) {
  const [query, setQuery] = useState("");
  // Both panels stay mounted, so a fixed id would give the document two search inputs.
  const searchId = useId();
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

  const visible = useMemo(
    () => filterEntries({ entries, facets, selected, query }),
    [entries, facets, query, selected],
  );

  // Query only. An empty facet list is what makes that literal rather than a promise.
  const visibleUnclassified = useMemo(
    () =>
      filterEntries({
        entries: unclassified,
        facets: [],
        selected: {},
        query,
      }),
    [unclassified, query],
  );

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
      {/* Its own scroll: as rows the column runs ~800px, and a sticky block taller than the
          viewport puts its last facet out of reach on a short screen. */}
      <aside className="flex shrink-0 flex-col gap-6 lg:sticky lg:top-24 lg:max-h-[calc(100vh-8rem)] lg:w-56 lg:overflow-y-auto lg:pr-1">
        <div className="flex flex-col gap-2">
          <label
            htmlFor={searchId}
            className="text-xs font-medium tracking-wide text-ink-faint uppercase"
          >
            Search
          </label>
          <input
            id={searchId}
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
            {/* Rows, not wrapped pills: variable-width chips left a ragged right edge, and
                the 224px column is too narrow to grid them without clipping the long names. */}
            <div className="flex flex-col gap-1">
              {facet.options.map(([value, count]) => {
                const isOn = selected[facet.key]?.includes(value) ?? false;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={isOn}
                    onClick={() => toggle(facet.key, value)}
                    className={`flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                      isOn
                        ? "border-accent bg-accent-wash text-ink"
                        : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
                    }`}
                  >
                    <span className="truncate">{value}</span>
                    <span className="shrink-0 font-mono text-[0.65rem] text-ink-faint">
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
          {/* Classified rows only; the section below carries its own count. */}
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

        {visible.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((entry) => (
              // Anchor target for gap-analysis links. Resolves in the unfiltered state.
              <div key={entry.id} id={entry.id} className="scroll-mt-24">
                {renderCard(entry)}
              </div>
            ))}
          </div>
        )}

        {/* Only when nothing at all matched: "no skill matches" above a section listing one
            that did is a small lie. A "gap in the catalogue" message used to live here, and
            became unreachable once the matrix went — chips are built from values the entries
            carry, so none can match nothing. Surfacing that again means drawing the empty
            values, not restoring the message. */}
        {visible.length === 0 && visibleUnclassified.length === 0 && (
          <p className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-ink-muted">
            No {noun} matches those filters.
          </p>
        )}

        {visibleUnclassified.length > 0 && (
          <section className="flex flex-col gap-3 border-t border-line pt-6">
            <div className="flex flex-col gap-1">
              <h3 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
                {unclassifiedLabel}{" "}
                <span className="font-mono normal-case">
                  ({visibleUnclassified.length})
                </span>
              </h3>
              {unclassifiedNote && (
                <p className="max-w-2xl text-xs text-ink-faint">
                  {unclassifiedNote}
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleUnclassified.map((entry) => (
                <div key={entry.id} id={entry.id} className="scroll-mt-24">
                  {renderCard(entry)}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
