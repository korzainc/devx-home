"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * The narrow-width nav, as a `details` so it opens before any JavaScript arrives.
 *
 * The client half exists for one reason: the header lives in the root layout, so a client side
 * navigation never remounts it and an open menu would still be sitting over the page you just
 * moved to. Closing on a path change is the whole job.
 */
export function NavMenu({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  return (
    <details ref={ref} className="group relative ml-auto sm:hidden">
      <summary
        aria-label="Menu"
        className="flex cursor-pointer list-none items-center rounded-lg border border-line px-2.5 py-2 text-ink-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden"
      >
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          {/* Swapped for a cross while open, so the control says how to undo itself. */}
          <g className="group-open:hidden">
            <path d="M2 4h12M2 8h12M2 12h12" />
          </g>
          <g className="hidden group-open:block">
            <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
          </g>
        </svg>
      </summary>

      <div className="absolute right-0 z-10 mt-2 flex w-44 flex-col items-start gap-3 rounded-lg border border-line bg-canvas p-3 shadow-lg">
        {children}
      </div>
    </details>
  );
}
