import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import korzaLogo from "@/assets/korza-logo.png";
import { NavMenu } from "@/components/nav-menu";
import { signOut } from "@/lib/auth-actions";
import { getSession } from "@/lib/session";

export function SiteHeader() {
  // z-20 because page content goes up to z-10: the roadmap vote controls sit at z-10 to clear
  // their card's stretched link, and being later in the DOM they would tie-break over a z-10
  // header and scroll across it.
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6">
        {/* shrink-0, or a narrow viewport squeezes this box below the width of its own contents
            and the wordmark spills out over the nav rather than the row simply overflowing. */}
        <Link href="/" className="flex shrink-0 items-center gap-3">
          {/* The wordmark ships as white-on-transparent artwork, so light mode inverts it.
              It is a single flat colour, which is the only reason inverting is safe here. */}
          {/* The static import's intrinsic size is 1014x317, which would have the optimizer
              serving a 2048px-wide file for a 32px-tall mark. These override it. */}
          <Image
            src={korzaLogo}
            alt="Korza"
            priority
            width={128}
            height={40}
            className="h-8 w-auto invert dark:invert-0"
          />
          <span aria-hidden className="h-7 w-px bg-line" />
          <span className="font-display text-lg font-medium tracking-tight text-ink">
            Dev
            {/* motion-safe, so anyone with reduced-motion set gets a static red X instead. */}
            <span className="text-accent motion-safe:animate-breathe">X</span>
          </span>
        </Link>

        {/* The same three items twice, once along the row and once inside the menu. Only one is
            ever visible, and getSession is memoised per request, so the pair costs one query. */}
        <nav className="ml-auto hidden items-center gap-5 sm:flex">
          <NavLinks />
          {/* Reading the session queries Postgres, so it stays behind its own boundary and the
              rest of the header paints without waiting on it. */}
          <Suspense fallback={null}>
            <AuthControl />
          </Suspense>
        </nav>

        <NavMenu>
          <NavLinks />
          <Suspense fallback={null}>
            <AuthControl />
          </Suspense>
        </NavMenu>
      </div>
    </header>
  );
}

const navLink =
  "text-sm whitespace-nowrap text-ink-muted transition-colors hover:text-ink";

function NavLinks() {
  return (
    <>
      <Link href="/roadmap" className={navLink}>
        Roadmap
      </Link>
      <Link href="/updates" className={navLink}>
        Updates
      </Link>
    </>
  );
}

async function AuthControl() {
  const session = await getSession();

  if (!session) {
    return (
      <Link href="/login" className={navLink}>
        Log in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-sm text-ink-muted sm:inline">
        {session.user.name}
      </span>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-lg border border-line px-3 py-1.5 text-sm whitespace-nowrap text-ink-muted transition-colors hover:text-ink"
        >
          Log out
        </button>
      </form>
    </div>
  );
}
