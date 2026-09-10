import Link from "next/link";
import { PRODUCTS } from "@/lib/nav";

/**
 * Every page the site has, grouped, at the foot of every page.
 *
 * This is the site's navigation now: the header carries one link, so a reader who reaches the end
 * of the catalogue and wants to cross to Tools finds the way here rather than by going home first.
 * `/ci-coverage` in particular had no link anywhere before this, reachable only by submitting the
 * repo form on the home page.
 *
 * Skills and Tools appearing here as well as on the home page is not a duplicate to remove. A
 * footer is what someone reads when they have finished a page and want the map.
 */

const REPO = "https://github.com/korzainc/devx-home";

type FooterLink = { label: string; href: string; external?: boolean };
type FooterColumn = { heading: string; links: FooterLink[] };

const PRODUCT: FooterColumn = { heading: "Product", links: PRODUCTS };

const LEARN: FooterColumn = {
  heading: "Learn",
  links: [
    { label: "Getting started", href: "/getting-started" },
    { label: "Introduction to skills", href: "/skills-intro" },
  ],
};

const PROJECT: FooterColumn = {
  heading: "Project",
  links: [
    { label: "Roadmap", href: "/roadmap" },
    { label: "Updates", href: "/updates" },
    { label: "GitHub", href: REPO, external: true },
  ],
};

const footerLink = "text-sm text-ink-muted transition-colors hover:text-ink";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line">
      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Where a reader is going on the left, what the site is on the right, pushed to the two
            edges of the content column. Not a 3-track grid: the longest link is about 160px, so
            equal tracks left every column trailing roughly 200px of nothing.

            The pair on the left is its own flex row so `justify-between` sees two children rather
            than three, which is what keeps Learn beside Product instead of drifting to the
            middle. Its gap is far smaller than the space it is separated from Project by, so the
            two read as one group. Narrow collapses the lot to a left-aligned stack. */}
        <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
          <div className="flex flex-col gap-8 sm:flex-row sm:gap-20">
            <Column {...PRODUCT} />
            <Column {...LEARN} />
          </div>
          <Column {...PROJECT} />
        </div>
      </div>
    </footer>
  );
}

function Column({ heading, links }: FooterColumn) {
  return (
    <div className="space-y-3">
      <p className="font-mono text-xs tracking-wide text-ink-faint uppercase">
        {heading}
      </p>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            {/* An anchor when it leaves the site: Link would prefetch a GitHub page. */}
            {link.external ? (
              <a href={link.href} className={footerLink}>
                {link.label}
              </a>
            ) : (
              <Link href={link.href} className={footerLink}>
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
