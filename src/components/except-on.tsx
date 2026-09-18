"use client";

import { usePathname } from "next/navigation";

/**
 * Renders its children everywhere except the paths named.
 *
 * The counterpart to `HomeOnly`, and client-side for the same reason: a parallel route slot ties
 * prerendering across the whole segment level, and `children` is still rendered on the server
 * either way, only dropped here.
 *
 * `/no-access` is the case it exists for. Its reader holds a session the gate refuses, so every
 * link in the nav redirects straight back to the page they are already on. Offering a way out
 * that is not one reads as a broken site rather than as a closed door, and the page already
 * carries the only two controls that work.
 */
export function ExceptOn({
  paths,
  children,
}: {
  paths: string[];
  children: React.ReactNode;
}) {
  return paths.includes(usePathname()) ? null : children;
}
