"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FacetMenu } from "@/components/facet-menu";
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
  /** One line saying why those rows sit apart, shown beside the heading. */
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
  const [toolchainOpen, setToolchainOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses search, which is what the hint in the field promises. Ignored while typing, or
  // the shortcut eats the character.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable]")) return;
      // Both tab panels stay mounted; only the visible one should take the key.
      if (!searchRef.current?.offsetParent) return;
      event.preventDefault();
      searchRef.current.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <label htmlFor={searchId} className="sr-only">
            {searchLabel}
          </label>
          <span
            aria-hidden
            className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-faint"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle
                cx="11"
                cy="11"
                r="7"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="m20 20-3.5-3.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <input
            id={searchId}
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchLabel}
            className="w-full rounded-lg border border-line bg-surface py-2.5 pr-11 pl-10 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong focus:outline-none"
          />
          <kbd
            aria-hidden
            className="absolute top-1/2 right-3 -translate-y-1/2 rounded border border-line px-1.5 py-0.5 font-mono text-[0.65rem] text-ink-faint"
          >
            /
          </kbd>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {facetOptions.map((facet) => (
            <FacetMenu
              key={facet.key}
              label={facet.label}
              options={facet.options}
              selected={selected[facet.key] ?? []}
              onToggle={(value) => toggle(facet.key, value)}
            />
          ))}
          {/* Classified rows only; the section below carries its own count. */}
          <span className="ml-1 shrink-0 text-sm text-ink-muted">
            <span className="font-mono text-ink">{visible.length}</span> of{" "}
            <span className="font-mono">{entries.length}</span>
          </span>
        </div>
      </div>

      {(activeCount > 0 || query) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {facetOptions.map((facet) => {
            const picked = selected[facet.key] ?? [];
            if (picked.length === 0) return null;
            // The facet name earns its own label only once a second facet is also on;
            // before that the chip says "Category: Build" and carries it inline.
            const grouped = activeCount > picked.length;
            return (
              <div
                key={facet.key}
                className="flex flex-wrap items-center gap-2"
              >
                {grouped && (
                  <span className="text-[0.65rem] tracking-wide text-ink-faint uppercase">
                    {facet.label}
                  </span>
                )}
                {picked.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggle(facet.key, value)}
                    className="flex items-center gap-1.5 rounded-full border border-line-strong bg-accent-wash px-3 py-1 text-xs text-ink transition-colors hover:border-line"
                  >
                    {grouped ? value : `${facet.label}: ${value}`}
                    <span aria-hidden className="text-ink-faint">
                      ✕
                    </span>
                    <span className="sr-only">, remove filter</span>
                  </button>
                ))}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setSelected({});
              setQuery("");
            }}
            className="text-sm text-accent hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

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
          that did is a small lie. */}
      {visible.length === 0 && visibleUnclassified.length === 0 && (
        <p className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-ink-muted">
          No {noun} matches those filters.
        </p>
      )}

      {visibleUnclassified.length > 0 && (
        <section className="flex flex-col gap-4">
          {/* Collapsed by default: these are listed for completeness rather than to be
              browsed, and open they push the classified rows off the first screen. */}
          <button
            type="button"
            aria-expanded={toolchainOpen}
            onClick={() => setToolchainOpen((was) => !was)}
            className="flex items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-left transition-colors hover:border-line-strong"
          >
            <span className="text-sm font-medium text-ink">
              {unclassifiedLabel}
            </span>
            <span className="font-mono text-xs text-ink-faint">
              {visibleUnclassified.length}
            </span>
            {unclassifiedNote && (
              <span className="hidden text-xs text-ink-faint lg:block">
                {unclassifiedNote}
              </span>
            )}
            <span aria-hidden className="ml-auto text-xs text-ink-faint">
              {toolchainOpen ? "▾" : "▸"}
            </span>
          </button>

          {toolchainOpen && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleUnclassified.map((entry) => (
                <div key={entry.id} id={entry.id} className="scroll-mt-24">
                  {renderCard(entry)}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
