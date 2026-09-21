"use client";

import { useState } from "react";

/**
 * The rolling list that stands in for the gap report.
 *
 * The window is a fixed height so the track has something to travel through, and the track holds
 * the list twice so there is no gap at the wrap. The second copy is hidden from assistive tech,
 * which reads the first and stops.
 *
 * A client component for the one reason below. The rows themselves are rendered on the server and
 * arrive as `children`, so nothing about the report ships to the browser.
 */
export function Roll({
  title,
  meta,
  children,
}: {
  title: string;
  meta: string;
  children: React.ReactNode;
}) {
  const [paused, setPaused] = useState(false);

  return (
    <div className="report-ground flex flex-col gap-1 p-5">
      <div className="flex items-baseline justify-between gap-3 pb-1">
        <span className="font-mono text-sm text-ink">{title}</span>
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-xs text-ink-faint">{meta}</span>
          {/* The list moves on its own for as long as the panel is open, which needs a way to
              stop it that is not hovering: a keyboard cannot hover and neither can a phone.

              Hidden rather than disabled where the reader has asked for less motion, because the
              stylesheet gives them no animation to stop and a control over nothing is worse than
              no control. A CSS variant rather than a media query read in script, so the button is
              already absent on the first paint. */}
          <button
            type="button"
            onClick={() => setPaused((was) => !was)}
            className="rounded-lg border border-line px-2 py-1 font-mono text-xs text-ink-muted transition-colors hover:border-line-strong hover:text-ink motion-reduce:hidden"
          >
            {paused ? "Play" : "Pause"}
          </button>
        </div>
      </div>
      <div className="report-window h-[19rem] overflow-hidden">
        <div className="report-roll" data-paused={paused ? "" : undefined}>
          {[0, 1].map((copy) => (
            <div key={copy} aria-hidden={copy === 1 ? true : undefined}>
              {children}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
