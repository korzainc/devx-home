"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CurrentRule } from "@/components/current-rule";
import { navLinkClass, type NavLinkShape } from "@/components/nav-link-styles";
import { isCurrent } from "@/lib/nav";

/**
 * A header link that knows whether it is the page you are on. `aria-current` is the half of the
 * marking that does not depend on anyone seeing the weight step.
 */
export function NavLink({
  href,
  shape,
  children,
}: {
  href: string;
  shape: NavLinkShape;
  children: React.ReactNode;
}) {
  const current = isCurrent(href, usePathname());

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={navLinkClass(shape, current)}
    >
      {children}
      {/* Row only: the panel has no border to sit on, and its plate marks it. */}
      {shape === "row" && current && <CurrentRule />}
    </Link>
  );
}
