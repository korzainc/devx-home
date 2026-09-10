"use client";

import { useLayoutEffect } from "react";

/**
 * Turns the document into a snapped scroller for as long as the page rendering this is on screen.
 *
 * It has to be an effect rather than CSS. The scroll container is the document, so the property
 * has to go on `html`, and the only way to scope that from a page is `html:has(...)` -- which
 * does not work here. On a client side navigation Next keeps the page you came from mounted at
 * `display: none`, ready for an instant back, and `:has` matches a hidden element perfectly
 * well: every page visited after the home page kept the snapping, and the footer's snap target
 * held them pinned to the bottom of the document.
 *
 * React hides that subtree with Activity, which runs effect cleanups while leaving the DOM in
 * place, so the teardown below fires exactly when the page stops being on screen.
 *
 * A layout effect, because a passive one tears down too late. The panels are the page's own, so
 * they vanish the moment it is hidden, which leaves the footer holding the only snap target in
 * the document; still snapping mandatorily, the browser pulls the incoming page down to it. The
 * reader clicks a link near the top of the home page and arrives at the foot of the next one.
 *
 * Nothing here is load bearing: with no script the page is a long scroll through the same
 * panels, which is why this sets no fallback and renders no markup.
 */
export function SnapScroll() {
  useLayoutEffect(() => {
    // Snapping hijacks the scroll position, which is the sort of motion this asks to be spared.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const { style } = document.documentElement;

    style.scrollSnapType = "y mandatory";
    // The sticky header, so a panel's top edge lands under the bar rather than behind it.
    style.scrollPaddingTop = "4rem";

    return () => {
      style.scrollSnapType = "";
      style.scrollPaddingTop = "";
    };
  }, []);

  return null;
}
