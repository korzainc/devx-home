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
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
 * Results under a catalogue's filter row. Unfiltered they sit in fixed sections; once any filter
 * is on they collapse into one grid, because the section headings would then only repeat what the
 * filter row already says.
 *
 * Sections are handed in already filtered and already emptied out. An empty one is dropped rather
 * than announced: unfiltered that can only mean the synced taxonomy stopped covering a category,
 * where "nothing matches your filters" would be a lie.
 */
export function CatalogueResults<T extends { id: string }>({
  sections,
  filtering,
  renderCard,
  noun,
  outsideMatches = 0,
}: {
  sections: CatalogueSection<T>[];
  filtering: boolean;
  renderCard: (entry: T) => ReactNode;
  /** Singular, for the empty state. */
  noun: string;
  /**
   * Rows the same query reaches that the page renders somewhere else, so the empty state cannot
   * contradict a card the reader can see. Counts what the query could show, not what is expanded:
   * collapsing a section hides a match, it does not stop it matching.
   */
  outsideMatches?: number;
}) {
  const shown = sections.flatMap((section) => section.entries);

  if (shown.length === 0) {
    if (outsideMatches > 0) return null;
    return <NoMatches noun={noun} />;
  }

  // Flattened from `sections`, not from the caller's full result list, so the filtered view can
  // never surface an entry the grouped view drops for sitting in no section.
  if (filtering) return <CardGrid entries={shown} renderCard={renderCard} />;

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
