import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The card chrome shared by /tools, /skills and the plugins tab.
 *
 * The fixed height is the point. Left to `h-full`, a grid row is only as tall as its tallest
 * card, so a page with varied copy renders several different card sizes. Height here plus the
 * clamp below makes them uniform by construction rather than by accident of how the rows happen
 * to fall.
 *
 * The footer rule does the rest: pinned with `mt-auto`, spare space collects as whitespace above
 * a line that sits in the same place on every card, instead of leaving the metadata floating at
 * a different offset per card.
 */
export function CatalogueCard({
  href,
  name,
  aside,
  summary,
  footerLeft,
  footerRight,
}: {
  href: string;
  /**
   * Sized by the caller, not here. Tool names top out at 20 characters and take 18px happily;
   * skill names reach 30 and would wrap out of the fixed height at that size.
   */
  name: ReactNode;
  /** Sits opposite the name, for a count or similar. */
  aside?: ReactNode;
  /** Nullable to match `CatalogueEntry`: a plugin is not guaranteed to carry one. */
  summary: string | null;
  footerLeft: ReactNode;
  footerRight?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex h-42 flex-col overflow-hidden rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-raised"
    >
      <div className="flex items-baseline justify-between gap-3">
        {name}
        {aside}
      </div>

      <p className="mt-2.5 mb-4 line-clamp-2 text-[0.8125rem] leading-relaxed text-ink-muted">
        {summary}
      </p>

      <div className="mt-auto flex items-baseline justify-between gap-3 border-t border-line pt-3.5 font-mono text-[0.65rem] text-ink-faint">
        {footerLeft}
        {footerRight}
      </div>
    </Link>
  );
}
