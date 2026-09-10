"use client";

import { usePathname } from "next/navigation";

/**
 * Renders its children on the home page and nowhere else.
 *
 * The footer is a full-bleed bar and `main` is a centred 6xl column with a gutter, so the footer
 * has to stay a sibling of `main` rather than move into `page.tsx`, where it would sit inset from
 * both edges. That leaves the layout holding something only one route wants.
 *
 * A parallel route slot is the tidier way to say this and was tried first. It does not work here:
 * slots at one segment level are prerendered or dynamic together, and adding one put the home
 * route into "uncached data during prerendering" on every load. Reading the path on the client
 * costs nothing at the boundary, because `children` is still rendered on the server and only
 * dropped here.
 */
export function HomeOnly({ children }: { children: React.ReactNode }) {
  return usePathname() === "/" ? children : null;
}
