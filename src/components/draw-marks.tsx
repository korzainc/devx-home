"use client";

import { useLayoutEffect } from "react";

/**
 * Draws the brush stroke behind each marked phrase as the phrase reaches the screen.
 *
 * The stroke used to be scrubbed by a `view()` timeline, which is the right tool on a page you
 * scroll freely and the wrong one on this one. Snapping means the document only ever comes to rest
 * at a panel edge, so the entire draw was spent inside the glide between two of them: by the time a
 * panel landed its stroke was already finished, and the drawing was never seen.
 *
 * So the draw runs on a clock and this starts it. A layout effect, because the undrawn state has to
 * be in place before the first paint -- set any later and every stroke is shown and then taken away.
 *
 * Nothing here is load bearing: with no script the strokes stay painted, which is what the stylesheet
 * renders on its own.
 */
export function DrawMarks() {
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const marks = [...document.querySelectorAll<HTMLElement>(".mark")];
    for (const mark of marks) mark.dataset.draw = "off";

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.draw = "on";
          // Once. A stroke that redraws every time the reader passes it turns emphasis into a tic.
          observer.unobserve(entry.target);
        }
      },
      // Held back from the bottom edge so the stroke starts as its panel arrives rather than while
      // the phrase is still clipped by it. Any threshold above zero would have been the sharper way
      // to say that, and would strand a phrase too wide to ever fit: these do not wrap.
      { rootMargin: "0px 0px -20% 0px" },
    );
    for (const mark of marks) observer.observe(mark);

    return () => observer.disconnect();
  }, []);

  return null;
}
