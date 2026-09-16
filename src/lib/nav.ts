/**
 * The three things the site actually offers, named once.
 *
 * The header dropdown and the footer's Product column both draw from this, so the bar and the
 * foot of the page cannot come to disagree about what a product is.
 */
export type ProductLink = {
  label: string;
  href: string;
};

export const PRODUCTS: ProductLink[] = [
  { label: "Agent Skills", href: "/skills" },
  { label: "CI Tools", href: "/tools" },
  { label: "CI Coverage", href: "/ci-coverage" },
];

/**
 * Whether `href` is the page at `pathname`, or an ancestor of it.
 *
 * Prefix, not equality: the products own detail routes (`/skills/[plugin]`), and a reader deep
 * in one still wants to know which product. It stops at a segment boundary, or `/skills-intro`
 * would light up Agent Skills. `/` is matched exactly, being a prefix of everything.
 *
 * `pathname` is nullable: `usePathname` returns null where there is no router, and nothing is
 * current then.
 */
export function isCurrent(href: string, pathname: string | null): boolean {
  if (pathname === null) return false;
  if (href === "/") return pathname === "/";

  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The product the page at `pathname` belongs to, which the header's shut trigger names. */
export function currentProduct(pathname: string | null): ProductLink | null {
  return PRODUCTS.find((product) => isCurrent(product.href, pathname)) ?? null;
}

/** Whether the page at `pathname` is one of the products, i.e. whether the group holds it. */
export function inProducts(pathname: string | null): boolean {
  return currentProduct(pathname) !== null;
}
