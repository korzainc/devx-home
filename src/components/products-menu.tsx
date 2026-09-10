"use client";

import Link from "next/link";
import { PRODUCTS } from "@/lib/nav";
import { useDismissableMenu } from "@/lib/use-dismissable-menu";

/**
 * The wide header's Products dropdown.
 *
 * A `details`, like `NavMenu` and `AccountMenu`: the bar has to open before any script arrives.
 * It hangs from the left edge of its trigger rather than the right, because it opens into the
 * middle of the row instead of off the end of it.
 */
export function ProductsMenu() {
  const ref = useDismissableMenu();

  return (
    <details ref={ref} className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-sm whitespace-nowrap text-ink-muted transition-colors group-open:text-ink hover:text-ink [&::-webkit-details-marker]:hidden">
        Products
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5 transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6.5l4 4 4-4" />
        </svg>
      </summary>

      <div className="absolute left-0 z-10 mt-3 w-48 rounded-lg border border-line bg-canvas p-1.5 shadow-lg">
        {PRODUCTS.map((product) => (
          <Link
            key={product.href}
            href={product.href}
            className="block rounded-md px-2.5 py-2 text-sm whitespace-nowrap text-ink-muted transition-colors hover:bg-surface hover:text-ink"
          >
            {product.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
