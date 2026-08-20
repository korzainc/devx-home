"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { href: "/tools", label: "Tools" },
  { href: "/skills", label: "Skills" },
];

// usePathname requires a Client Component, so this is deliberately the only client-side part
// of the header - the brand and layout around it stay on the server.
export function NavLinks() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {sections.map(({ href, label }) => {
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
              isActive
                ? "bg-accent-wash text-ink"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
