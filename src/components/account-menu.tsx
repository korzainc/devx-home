"use client";

import { useDismissableMenu } from "@/lib/use-dismissable-menu";

/**
 * The signed-in block in the wide header: an avatar that opens onto who you are and the way out.
 *
 * A `details`, like `NavMenu`, and for the same reason: the header has to work before any script
 * arrives. `FacetMenu` is the other popover pattern in the repo and it cannot do that.
 *
 * `trigger` is rendered by the server component that owns the session, so the avatar and the name
 * never cross into the client bundle as data.
 */
export function AccountMenu({
  trigger,
  children,
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useDismissableMenu();

  return (
    <details ref={ref} className="group relative">
      <summary
        aria-label="Account"
        className="flex cursor-pointer list-none items-center rounded-full transition-opacity hover:opacity-80 [&::-webkit-details-marker]:hidden"
      >
        {trigger}
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-56 rounded-lg border border-line bg-canvas p-1.5 shadow-lg">
        {children}
      </div>
    </details>
  );
}
