"use client";

import { useLayoutEffect } from "react";

/** The brush strokes and the skill cards: everything with an entrance to run. */
const ARRIVING = ".mark, .deal";

/**
 * Runs the home page's entrance animations as their panel reaches the screen.
 *
 * Both used to be scrubbed by a `view()` timeline, which is the right tool on a page you scroll
 * freely and the wrong one on this one. Snapping means the document only ever comes to rest at a
 * panel edge, so an entrance was spent entirely inside the glide between two of them: by the time
 * a panel landed its strokes were drawn and its cards were dealt, and neither was ever seen.
 *
 * So they run on a clock and this starts them. A layout effect, because the held state has to be
 * in place before the first paint -- set any later and the entrance is shown and then taken away.
 *
 * Nothing here is load bearing. With no script the strokes stay painted and the cards deal on
 * load, which is what the stylesheet renders on its own.
 */
export function Arrive() {
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const targets = [...document.querySelectorAll<HTMLElement>(ARRIVING)];
    for (const target of targets) target.dataset.arrive = "off";

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.arrive = "on";
          // Once. An entrance that replays every time the reader passes it turns into a tic.
          observer.unobserve(entry.target);
        }
      },
      // Held back from the bottom edge so a stroke starts as its panel arrives rather than while
      // the phrase is still clipped by it. Any threshold above zero would have been the sharper
      // way to say that, and would strand a phrase too wide to ever fit: these do not wrap.
      { rootMargin: "0px 0px -20% 0px" },
    );
    for (const target of targets) observer.observe(target);

    return () => observer.disconnect();
  }, []);

  return null;
}
