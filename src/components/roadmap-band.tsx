"use client";

import { useState } from "react";
import { RoadmapCard } from "@/components/roadmap-card";
import type { RoadmapEntry, RoadmapStage } from "@/lib/roadmap";
import type { BoardState } from "@/lib/roadmap-discussion";

/* One stage, with its own category filter. Client-side because the filter is per section: putting
   four of them in the URL would mean four query params on one page. The entries themselves are
   read on the server and passed in. */
export function RoadmapBand({
  stage,
  blurb,
  empty,
  entries,
  board,
}: {
  stage: RoadmapStage;
  blurb: string;
  /** Written per stage, since "nothing queued" and "nothing has landed" do not mean the same
      thing to whoever is reading. */
  empty: string;
  entries: RoadmapEntry[];
  /** Unresolved on purpose. Each card unwraps it inside its own Suspense boundary, so the page
      still prerenders around votes that can only be read at request time. */
  board: Promise<BoardState>;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  }

  const visible = picked
    ? entries.filter((entry) => entry.category === picked)
    : entries;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 border-b border-line pb-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-display text-xl font-medium tracking-tight capitalize">
            {stage}
          </h2>
          <span className="font-mono text-xs text-ink-faint">
            {entries.length}
          </span>
          <p className="text-sm text-ink-muted">{blurb}</p>
        </div>

        {/* Only worth a filter when there is more than one category to choose between. */}
        {counts.size > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            {[...counts]
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([category, count]) => {
                const isOn = picked === category;
                return (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={isOn}
                    onClick={() => setPicked(isOn ? null : category)}
                    className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                      isOn
                        ? "border-accent bg-accent-wash text-ink"
                        : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
                    }`}
                  >
                    {category}
                    <span className="font-mono text-[0.65rem] text-ink-faint">
                      {count}
                    </span>
                  </button>
                );
              })}
          </div>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-ink-muted">
          {empty}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((entry) => (
            <RoadmapCard key={entry.slug} entry={entry} board={board} />
          ))}
        </div>
      )}
    </section>
  );
}
