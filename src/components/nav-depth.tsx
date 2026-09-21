"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { markCameFromApp } from "@/components/back-link";

/**
 * Marks each history entry the reader reaches by navigating forward inside the app, so `BackLink`
 * can tell someone who walked here from someone who arrived cold on a deep link.
 *
 * Renders nothing and sits in the root layout, where every route change passes through it. The
 * first pathname of a document is not marked: that one is the arrival, and its previous history
 * entry belongs to wherever the reader came from, not to us.
 *
 * A back or forward step also changes the pathname, and must not mark anything: the entry it
 * lands on already carries its own answer, and re-marking it is how the cold arrival would come
 * to claim a safe step back onto the external referrer. `popstate` fires before the router
 * commits the new pathname, so it is enough to note that the next change came from history.
 */
export function NavDepth() {
  const pathname = usePathname();
  const arrived = useRef(false);
  const popped = useRef(false);

  useEffect(() => {
    const onPopState = () => {
      popped.current = true;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!arrived.current) {
      arrived.current = true;
      return;
    }
    if (popped.current) {
      popped.current = false;
      return;
    }
    markCameFromApp();
  }, [pathname]);

  return null;
}
