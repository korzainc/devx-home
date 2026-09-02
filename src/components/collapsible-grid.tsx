"use client";

import { useState } from "react";

/** Fills the last grid cell rather than sitting under it, so the block stays rectangular. */
export const PREVIEW = 5;

export function CollapsibleGrid({
  id,
  heading,
  noun,
  items,
  forceExpanded = false,
  onCollapse,
}: {
  /** Put on the grid itself, so `aria-controls` on the toggle resolves and a control outside
   * this component can name what it expands. Required: when it was optional, the tools page
   * omitted it and would have shipped a toggle with `aria-expanded` and no `aria-controls`
   * the day a bundle wrapped more than PREVIEW tools. */
  id: string;
  /** Rendered as "{heading} ({items.length})". */
  heading: string;
  /** Plural noun for the "Show all N <noun>" button. */
  noun: string;
  /** Pre-rendered: a Client Component can take a Server Component's JSX as a prop but not a
   * function, so the caller builds each card and this only handles show more/fewer. */
  items: { key: string; node: React.ReactNode }[];
  /** Expand regardless of the internal toggle, e.g. a caller-side deep link into the grid. */
  forceExpanded?: boolean;
  /** Called right before collapsing, whether triggered by `expanded` or `forceExpanded`. */
  onCollapse?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const showAll = expanded || forceExpanded;
  const shown = showAll ? items : items.slice(0, PREVIEW);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
        {heading} ({items.length})
      </h2>

      <div id={id} className="grid gap-3 lg:grid-cols-2">
        {shown.map((item) => (
          <div key={item.key}>{item.node}</div>
        ))}

        {items.length > PREVIEW && (
          // One button rather than two that swap: activating one that then unmounts
          // drops focus to the body.
          <button
            type="button"
            aria-controls={id}
            aria-expanded={showAll}
            onClick={(event) => {
              if (showAll) {
                // Collapsing unmounts the rows past the preview, and focus may be sitting on
                // one of them. Clicking a button does not focus it on Safari or Firefox, so
                // without this the focused row is removed and focus falls to the body, sending
                // the next Tab back to the top of the document.
                //
                // Scoped to rows that will actually go: a whole-grid check also stole focus
                // off a row inside the preview, which survives and had no reason to lose it.
                const toggle = event.currentTarget;
                const grid = toggle.parentElement;
                const focused = document.activeElement;
                if (grid && focused && focused !== toggle) {
                  const cells = [...grid.children];
                  const cell = cells.find((node) => node.contains(focused));
                  if (cell && cells.indexOf(cell) >= PREVIEW) toggle.focus();
                }
                onCollapse?.();
              }
              setExpanded(!showAll);
            }}
            className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            {showAll ? "Show fewer" : `Show all ${items.length} ${noun}`}
            <span aria-hidden className="ml-1.5 text-[0.65rem]">
              {showAll ? "▴" : "▾"}
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
