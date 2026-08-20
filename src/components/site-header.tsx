import Link from "next/link";
import { NavLinks } from "@/components/nav-links";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-6">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-medium tracking-tight text-ink">DevX</span>
          <span className="font-mono text-xs text-ink-faint">korza</span>
        </Link>
        <NavLinks />
      </div>
    </header>
  );
}
