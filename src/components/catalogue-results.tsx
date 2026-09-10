import type { ReactNode } from "react";

export type CatalogueSection<T> = {
  label: string;
  /** One line naming what the section holds, beside the heading. */
  note: string;
  entries: T[];
};

/** The card grid itself. Each card is wrapped in an anchor target so a deep link from gap
 *  analysis lands on it, which resolves in the unfiltered state. */
export function CardGrid<T extends { id: string }>({
  entries,
  renderCard,
}: {
  entries: T[];
  renderCard: (entry: T) => ReactNode;
}) {
  return (
    // `grid-cols-1` is load-bearing, not the default spelled out. Without it the one-column track
    // is `auto`, whose floor is min-content, and the cards truncate with `white-space: nowrap`, so
    // min-content is the full untruncated string. A tool carrying three capabilities widened the
    // track to 896px on a 390px screen. The breakpoint classes never showed it because Tailwind
    // emits `minmax(0, 1fr)`, which floors at zero.
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {entries.map((entry) => (
        <div key={entry.id} id={entry.id} className="scroll-mt-24">
          {renderCard(entry)}
        </div>
      ))}
    </div>
  );
}

/** For a catalogue with no section axis, which renders its grid directly and still needs the one
 *  sentence every catalogue says when nothing is left. */
export function NoMatches({ noun }: { noun: string }) {
  return (
    <p className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-ink-muted">
      No {noun} matches those filters.
    </p>
  );
}

/**
 * Results under a catalogue's filter row, either grouped under their section headings or flattened
 * into one grid.
 *
 * Which one a filtered view wants is the caller's call, because it turns on whether that page's
 * filter axes restate its section axis. `/tools` filters by capability, which is close enough to
 * its category headings that a filtered view puts nearly every match under one of them, so it
 * flattens. `/skills` filters by audience, which cuts across all five headings, so it stays
 * grouped and the reader can still see which kinds of work their picks reach.
 *
 * Sections are handed in already filtered and already emptied out. An empty one is dropped rather
 * than announced: unfiltered that can only mean the synced taxonomy stopped covering a category,
 * where "nothing matches your filters" would be a lie.
 */
export function CatalogueResults<T extends { id: string }>({
  sections,
  layout,
  renderCard,
  noun,
}: {
  sections: CatalogueSection<T>[];
  layout: "sections" | "grid";
  renderCard: (entry: T) => ReactNode;
  /** Singular, for the empty state. */
  noun: string;
}) {
  const shown = sections.flatMap((section) => section.entries);

  if (shown.length === 0) return <NoMatches noun={noun} />;

  // Flattened from `sections`, not from the caller's full result list, so the flat view can never
  // surface an entry the grouped view drops for sitting in no section.
  if (layout === "grid")
    return <CardGrid entries={shown} renderCard={renderCard} />;

  return (
    <>
      {sections.map((section) => (
        <section key={section.label} className="flex flex-col gap-4">
          <div className="flex items-baseline gap-x-3 border-b border-line pb-2">
            <h2 className="shrink-0 font-display text-xl font-semibold text-ink">
              {section.label}
            </h2>
            {/* Truncates instead of wrapping, so the heading row stays one line however long a
                section's note runs. */}
            <span
              title={section.note}
              className="min-w-0 flex-1 truncate text-xs text-ink-faint"
            >
              {section.note}
            </span>
          </div>
          <CardGrid entries={section.entries} renderCard={renderCard} />
        </section>
      ))}
    </>
  );
}
