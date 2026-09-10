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
