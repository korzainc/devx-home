"use client";

import { usePathname } from "next/navigation";
import { NavLink } from "@/components/nav-link";
import { currentProduct, PRODUCTS } from "@/lib/nav";
import { CurrentRule } from "@/components/current-rule";
import { useDismissableMenu } from "@/lib/use-dismissable-menu";

/**
 * The wide header's Products dropdown.
 *
 * A `details`, like `NavMenu` and `AccountMenu`: the bar has to open before any script arrives.
 * It hangs from the left edge of its trigger rather than the right, because it opens into the
 * middle of the row instead of off the end of it.
 *
 * When the page is one of the products the shut trigger names it, "Products / Agent Skills",
 * so the bar answers where you are unopened. It appends rather than replaces: the leaf alone
 * would take the word the reader clicks for the siblings out of the bar.
 */
export function ProductsMenu() {
  const ref = useDismissableMenu();
  const pathname = usePathname();
  const product = currentProduct(pathname);
  const holdsCurrent = product !== null;

  return (
    <details ref={ref} className="group relative h-full">
      <summary
        className={`relative flex h-full cursor-pointer list-none items-center gap-1 text-sm whitespace-nowrap transition-colors group-open:text-ink hover:text-ink [&::-webkit-details-marker]:hidden ${
          holdsCurrent ? "font-medium text-ink" : "text-ink-muted"
        }`}
      >
        {/* Muted beside the leaf, so the leaf is the half that reads. */}
        <span className={holdsCurrent ? "font-normal text-ink-muted" : ""}>
          Products
        </span>
        {product && (
          <>
            <span aria-hidden className="mx-1.5 text-ink-faint">
              /
            </span>
            {product.label}
          </>
        )}
        {holdsCurrent && <CurrentRule />}
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
          <NavLink key={product.href} href={product.href} shape="panel">
            {product.label}
          </NavLink>
        ))}
      </div>
    </details>
  );
}
