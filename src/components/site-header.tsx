import Image from "next/image";
import Link from "next/link";
import korzaLogo from "@/assets/korza-logo.png";
import { NavLinks } from "@/components/nav-links";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-6 px-6">
        <Link href="/" className="flex items-center gap-3">
          {/* The wordmark ships as white-on-transparent artwork, so light mode inverts it.
              It is a single flat colour, which is the only reason inverting is safe here. */}
          {/* The static import's intrinsic size is 1014x317, which would have the optimizer
              serving a 2048px-wide file for a 16px-tall mark. These override it. */}
          <Image
            src={korzaLogo}
            alt="Korza"
            priority
            width={64}
            height={20}
            className="h-4 w-auto invert dark:invert-0"
          />
          <span aria-hidden className="h-4 w-px bg-line" />
          <span className="font-display text-sm font-medium tracking-tight text-ink">
            Dev
            {/* motion-safe, so anyone with reduced-motion set gets a static red X instead. */}
            <span className="text-accent motion-safe:animate-breathe">X</span>
          </span>
        </Link>
        <NavLinks />
      </div>
    </header>
  );
}
