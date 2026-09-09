"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * A ref for a `details` that shuts itself when the path changes.
 *
 * The header lives in the root layout, so a client side navigation never remounts it and an open
 * menu would still be sitting over the page you just moved to. Closing on a path change is the
 * whole job, and it is the only reason either header menu needs to be a client component at all.
 */
export function useCloseOnNavigate() {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  return ref;
}
