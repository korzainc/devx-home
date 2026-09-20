"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { recordNavDepth } from "@/components/back-link";

/**
 * Counts how many navigations the reader has made inside the app, so `BackLink` can tell someone
 * who walked here from someone who arrived cold on a deep link.
 *
 * Renders nothing and sits in the root layout, where every route change passes through it. The
 * first pathname of a document is not counted: that one is the arrival, and its previous history
 * entry belongs to wherever the reader came from, not to us.
 */
export function NavDepth() {
  const pathname = usePathname();
  const arrived = useRef(false);

  useEffect(() => {
    if (!arrived.current) {
      arrived.current = true;
      return;
    }
    recordNavDepth();
  }, [pathname]);

  return null;
}
