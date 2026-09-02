"use client";

import { useState } from "react";

/** Fills the last grid cell rather than sitting under it, so the block stays rectangular. */
const PREVIEW = 5;

export function CollapsibleGrid({
  heading,
  noun,
  items,
}: {
  /** Rendered as "{heading} ({items.length})". */
  heading: string;
  /** Plural noun for the "Show all N <noun>" button. */
  noun: string;
  /** Pre-rendered: a Client Component can take a Server Component's JSX as a prop but not a
   * function, so the caller builds each card and this only handles show more/fewer. */
  items: { key: string; node: React.ReactNode }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, PREVIEW);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
        {heading} ({items.length})
      </h2>

      <div className="grid gap-3 lg:grid-cols-2">
        {shown.map((item) => (
          <div key={item.key}>{item.node}</div>
        ))}

        {items.length > PREVIEW && (
          // One button rather than two that swap: activating one that then unmounts
          // drops focus to the body.
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((was) => !was)}
            className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            {expanded ? "Show fewer" : `Show all ${items.length} ${noun}`}
            <span aria-hidden className="ml-1.5 text-[0.65rem]">
              {expanded ? "▴" : "▾"}
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
