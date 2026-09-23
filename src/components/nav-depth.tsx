"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { markCameFromApp } from "@/components/back-link";

/**
 * Marks each history entry the reader reaches by navigating forward inside the app, so `BackLink`
 * can tell someone who walked here from someone who arrived cold on a deep link.
 *
 * Renders nothing and sits in the root layout, where every route change passes through it. The
 * first location of a document is not marked: that one is the arrival, and its previous history
 * entry belongs to wherever the reader came from, not to us.
 *
 * A back or forward step also changes the location, and must not mark anything: the entry it
 * lands on already carries its own answer, and re-marking it is how the cold arrival would come
 * to claim a safe step back onto the external referrer. `popstate` fires before the router
 * commits the new location, so it is enough to note that the next change came from history.
 *
 * What is remembered is the last location rather than a "have we arrived yet" flag, because a
 * flag cannot survive being set twice. Strict Mode double-invokes this effect in development, and
 * a second run reading its own first run's flag would mark the cold arrival — the very entry the
 * guard exists to leave alone. Re-running against a remembered location is a no-op instead, so
 * development behaves the way production does and the fix can be verified by hand.
 *
 * A note is only left when the pop actually moves the pathname, because only a pathname change
 * can spend it. A hash link — `/updates#some-entry`, which `usePathname` still reads as
 * `/updates` — pushes a real history entry the reader can step back over, and stepping back over
 * one reaches no pathname change. A note left for it would sit latched and swallow the next
 * genuine forward navigation. Such a step needs no note anyway: the entry it lands on already
 * carries the answer it was given.
 */
export function NavDepth() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);
  const popped = useRef(false);

  useEffect(() => {
    const onPopState = () => {
      // A pop that only moves the hash is answered here and leaves no note: the pathname will
      // not change, so the effect below would never run to spend one, and it would sit latched
      // until it swallowed the next genuine forward navigation. Comparing against the pathname
      // the router is showing needs no guess about when the router commits — `location.pathname`
      // is already the destination when `popstate` fires, whereas `usePathname` catches up
      // later. Equal means the step stayed within this page.
      if (window.location.pathname === last.current) return;
      popped.current = true;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    // Re-running against a remembered pathname rather than a "have we arrived yet" flag: Strict
    // Mode double-invokes this in development, and a flag reading its own first run would mark
    // the cold arrival — the entry the guard exists to leave alone. This way the re-run is a
    // no-op, so development behaves the way production does and the fix verifies by hand.
    if (last.current === null) {
      last.current = pathname;
      return;
    }
    if (last.current === pathname) return;
    last.current = pathname;

    if (popped.current) {
      popped.current = false;
      return;
    }
    markCameFromApp();
  }, [pathname]);

  return null;
}
