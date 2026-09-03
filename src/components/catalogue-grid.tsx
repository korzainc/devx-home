"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { FacetMenu } from "@/components/facet-menu";
import { facetValues, type CatalogueEntry, type Facet } from "@/lib/catalogue";
import { filterEntries } from "@/lib/filter";
import { terms } from "@/lib/search";

// WCAG 2.1.4 requires an unmodified single-character shortcut to be turnable off, remappable,
// or focus-scoped; this is the "turn it off" escape, shared by both catalogues since they
// render the same grid. The server has no localStorage, so `useSyncExternalStore`'s
// `getServerSnapshot` renders "on" there and on first client paint, then hands off with no mismatch.
const SLASH_SHORTCUT_KEY = "korza-devx:slash-shortcut-enabled";
const slashShortcutListeners = new Set<() => void>();
// Set only when a write fails (private browsing, storage disabled), so a read has something to
// return instead of replaying the stale pre-write value from storage. Cleared on a write that
// succeeds, so storage recovering mid-session is trusted again rather than shadowed forever.
let slashShortcutOverride: boolean | null = null;

function getSlashShortcutEnabled(): boolean {
  if (slashShortcutOverride !== null) return slashShortcutOverride;
  try {
    return localStorage.getItem(SLASH_SHORTCUT_KEY) !== "false";
  } catch {
    return true;
  }
}

function getSlashShortcutServerSnapshot(): boolean {
  return true;
}

function subscribeSlashShortcut(onChange: () => void): () => void {
  slashShortcutListeners.add(onChange);
  return () => slashShortcutListeners.delete(onChange);
}

function setSlashShortcutEnabled(next: boolean): void {
  try {
    localStorage.setItem(SLASH_SHORTCUT_KEY, String(next));
    slashShortcutOverride = null;
  } catch {
    slashShortcutOverride = next;
  }
  for (const listener of slashShortcutListeners) listener();
}

type CatalogueGridProps<T extends CatalogueEntry> = {
  entries: T[];
  facets: Facet<T>[];
  renderCard: (entry: T) => ReactNode;
  searchLabel: string;
  /** Singular noun for the rows, used in the empty state. */
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
  // null follows the search; a click pins it. One value, so the chevron, the rows and the
  // count cannot disagree.
  const [pinned, setPinned] = useState<boolean | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const slashEnabled = useSyncExternalStore(
    subscribeSlashShortcut,
    getSlashShortcutEnabled,
    getSlashShortcutServerSnapshot,
  );

  function toggleSlashShortcut() {
    setSlashShortcutEnabled(!slashEnabled);
  }

  // "/" focuses search, which is what the hint in the field promises. Ignored while typing, or
  // the shortcut eats the character.
  useEffect(() => {
    if (!slashEnabled) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      // Also covers any expanded disclosure (a facet popup, the unclassified-rows toggle), not
      // just the trigger itself: a facet popup doesn't close on a focus change alone, so
      // stealing focus here would leave it open but no longer focused.
      if (
        target?.matches(
          'input, textarea, [contenteditable], [aria-expanded="true"]',
        )
      )
        return;
      // Both tab panels stay mounted; only the visible one should take the key.
      if (!searchRef.current?.offsetParent) return;
      event.preventDefault();
      searchRef.current.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [slashEnabled]);

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

  // Query only: these rows are never faceted.
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

  const searching = terms(query).length > 0;
  const facetsActive = Object.values(selected).some(
    (picked) => picked.length > 0,
  );
  // A search reveals these rows; a facet cannot, since they sit outside every facet.
  const unclassifiedShown = pinned ?? (searching && !facetsActive);
  // The count and the empty state both answer "what is on screen", so they cannot contradict
  // each other or the rows themselves.
  const onScreen =
    visible.length + (unclassifiedShown ? visibleUnclassified.length : 0);
  // What the search could reveal, pinned or not: a collapsed section may hold the only match.
  const couldShow =
    visible.length +
    (searching && !facetsActive ? visibleUnclassified.length : 0);

  const activeCount = Object.values(selected).reduce(
    (total, picked) => total + picked.length,
    0,
  );

  // The visible count updates every keystroke; the announcement waits for typing to settle, so
  // a screen reader isn't read ten results in a row while a word is still being typed.
  const [announcedCount, setAnnouncedCount] = useState(onScreen);
  useEffect(() => {
    const timeout = setTimeout(() => setAnnouncedCount(onScreen), 500);
    return () => clearTimeout(timeout);
  }, [onScreen]);
  const total = entries.length + unclassified.length;

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
            onKeyDown={(event) => {
              // Clears first; blurring outright would dump focus onto <body>, restarting the
              // next Tab from the top of the document instead of continuing past this field.
              if (event.key === "Escape" && query) setQuery("");
            }}
            placeholder={searchLabel}
            // A text input matches :focus-visible on every click, not just keyboard nav, so the
            // global accent outline painted here on every click. border-accent keeps a real,
            // AA-contrast focus signal without bringing that ring back.
            className="w-full rounded-lg border border-line bg-surface py-2.5 pr-11 pl-10 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus-visible:outline-none"
          />
          <button
            type="button"
            onClick={toggleSlashShortcut}
            aria-pressed={slashEnabled}
            aria-label={
              slashEnabled
                ? "Keyboard shortcut: press / to jump here. Click to turn it off."
                : "The / keyboard shortcut is off. Click to turn it back on."
            }
            title={
              slashEnabled
                ? "Press / to jump here. Click to turn off."
                : "The / shortcut is off. Click to turn back on."
            }
            className={`absolute top-1/2 right-3 -translate-y-1/2 rounded border border-line px-1.5 py-0.5 font-mono text-[0.65rem] text-ink-faint transition-colors hover:border-line-strong ${slashEnabled ? "" : "line-through"}`}
          >
            /
          </button>
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
          {/* The debounced, worded version below carries this for assistive tech, so a screen
              reader doesn't read the count twice. */}
          <span aria-hidden className="ml-1 shrink-0 text-sm text-ink-muted">
            <span className="font-mono text-ink">{onScreen}</span> of{" "}
            <span className="font-mono">{total}</span>
          </span>
          <span role="status" className="sr-only">
            {announcedCount} of {total} {noun}
            {announcedCount === 1 ? "" : "s"} shown
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
                    aria-label={`Remove ${facet.label} filter: ${value}`}
                    onClick={(event) => {
                      toggle(facet.key, value);
                      // Keyboard only: a text input always matches :focus-visible, so
                      // doing this on a mouse click paints an accent ring on the field.
                      if (event.detail === 0) searchRef.current?.focus();
                    }}
                    className="flex items-center gap-1.5 rounded-full border border-line-strong bg-accent-wash px-3 py-1 text-xs text-ink transition-colors hover:border-line"
                  >
                    {grouped ? value : `${facet.label}: ${value}`}
                    <span aria-hidden className="text-ink-faint">
                      ✕
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
          <button
            type="button"
            onClick={(event) => {
              setSelected({});
              setQuery("");
              if (event.detail === 0) searchRef.current?.focus();
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

      {onScreen === 0 && couldShow === 0 && (
        <p className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-ink-muted">
          No {noun} matches those filters.
        </p>
      )}

      {visibleUnclassified.length > 0 && (
        <section className="flex flex-col gap-4">
          {/* Open, these nine push the classified rows off the first screen. */}
          <button
            type="button"
            aria-expanded={unclassifiedShown}
            onClick={() => setPinned(!unclassifiedShown)}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-line px-4 py-3 text-left transition-colors hover:border-line-strong"
          >
            <span className="text-sm font-medium text-ink">
              {unclassifiedLabel}
            </span>
            <span className="font-mono text-xs text-ink-faint">
              {visibleUnclassified.length}
            </span>
            {unclassifiedNote && (
              <span className="text-xs text-ink-faint">{unclassifiedNote}</span>
            )}
            <span aria-hidden className="ml-auto text-xs text-ink-faint">
              {unclassifiedShown ? "▾" : "▸"}
            </span>
          </button>

          {unclassifiedShown && (
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
