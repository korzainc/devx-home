import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import korzaLogo from "@/assets/korza-logo.png";
import { AccountMenu } from "@/components/account-menu";
import { NavMenu } from "@/components/nav-menu";
import { ProductsMenu } from "@/components/products-menu";
import { signOut } from "@/lib/auth-actions";
import { avatarSrc, initials } from "@/lib/avatar";
import { PRODUCTS } from "@/lib/nav";
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
          {/* The static import's intrinsic size is 1014x317, which would have the optimizer
              serving a 2048px-wide file for a 32px-tall mark. These override it. */}
          <Image
            src={korzaLogo}
            alt="Korza"
            priority
            width={128}
            height={40}
            className="h-8 w-auto"
          />
          <span aria-hidden className="h-7 w-px bg-line" />
          <span className="font-display text-lg font-medium tracking-tight text-ink">
            Dev
            {/* motion-safe, so anyone with reduced-motion set gets a static red X instead. */}
            <span className="text-accent motion-safe:animate-breathe">X</span>
          </span>
        </Link>

        {/* The same items twice, once along the row and once inside the menu. Only one is ever
            visible, and getSession is memoised per request, so the pair costs one query. */}
        <nav className="ml-auto hidden items-center gap-5 sm:flex">
          <NavLinks />
          {/* Reading the session queries Postgres, so it stays behind its own boundary and the
              rest of the header paints without waiting on it. The fallback stays null: the
              signed-out control there would show every signed-in reader "Log in" for the
              300-1900ms the session takes. The <noscript> covers them instead (DX-100). */}
          <NoScriptLoginLink />
          <Suspense fallback={null}>
            <AuthControl />
          </Suspense>
        </nav>

        <NavMenu>
          <NavLinks inMenu />
          <NoScriptLoginLink />
          <Suspense fallback={null}>
            <AuthControl inMenu />
          </Suspense>
        </NavMenu>
      </div>
    </header>
  );
}

const navLink =
  "text-sm whitespace-nowrap text-ink-muted transition-colors hover:text-ink";

/**
 * What the site sells, then the way in. Roadmap and Updates stay in the footer: they are read
 * occasionally rather than moved through.
 *
 * `inMenu` is the narrow copy, inside the hamburger, and it flattens the dropdown. A dropdown
 * nested in a dropdown would cost two taps to reach one link, and the panel groups by stacking
 * under a heading instead.
 */
function NavLinks({ inMenu = false }: { inMenu?: boolean }) {
  const gettingStarted = (
    <Link href="/getting-started" className={navLink}>
      Getting started
    </Link>
  );

  if (!inMenu)
    return (
      <>
        <ProductsMenu />
        {gettingStarted}
      </>
    );

  return (
    <>
      <p className="font-mono text-xs tracking-wide text-ink-faint uppercase">
        Products
      </p>
      {PRODUCTS.map((product) => (
        <Link key={product.href} href={product.href} className={navLink}>
          {product.label}
        </Link>
      ))}
      <span aria-hidden className="h-px w-full bg-line" />
      {gettingStarted}
    </>
  );
}

const loginHref = "/login";
const loginLabel = "Log in";

function LoginLink() {
  return (
    <Link href={loginHref} className={navLink}>
      {loginLabel}
    </Link>
  );
}

// Boundary content is moved into place by an inline `$RC` call, so a client that runs no script
// never sees it. Set as markup, not elements: a browser with scripts on parses <noscript> as
// text, which would mismatch on hydration. Shares its constants with `LoginLink`.
function NoScriptLoginLink() {
  return (
    <noscript
      dangerouslySetInnerHTML={{
        __html: `<a class="${navLink}" href="${loginHref}">${loginLabel}</a>`,
      }}
    />
  );
}

/**
 * The account block, in the two places the header draws it.
 *
 * `inMenu` is the narrow-width copy, inside the hamburger. It stays flat: a dropdown nested in a
 * dropdown would need two taps to reach a single item, and that panel already separates the
 * account from the links by stacking them.
 */
async function AuthControl({ inMenu = false }: { inMenu?: boolean }) {
  const session = await getSession();

  if (!session) return <LoginLink />;

  const { name, email, image } = session.user;
  const avatar = <Avatar image={image} name={name} />;

  if (inMenu)
    return (
      <>
        <span className="flex items-center gap-2">
          {avatar}
          <span className="truncate text-sm text-ink-muted">{name}</span>
        </span>
        <SignOut className={navLink} />
      </>
    );

  return (
    <>
      {/* The whole of the fix: a rule between going somewhere and being someone, so the account
          stops reading as a fourth destination in the row. */}
      <span aria-hidden className="h-5 w-px bg-line" />
      <AccountMenu trigger={avatar}>
        <div className="px-2.5 py-2">
          <p className="truncate text-sm text-ink">{name}</p>
          <p className="truncate text-xs text-ink-faint">{email}</p>
        </div>
        {/* `mx-2.5` matches the rows' own padding, so the rule starts where the name, the email
            and the Log out label do. Left to the panel's `p-1.5` it sat 10px short of all three
            and lined up with nothing. */}
        <hr className="mx-2.5 my-1.5 border-line" />
        <SignOut className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-ink-muted transition-colors hover:bg-surface hover:text-ink" />
      </AccountMenu>
    </>
  );
}

function SignOut({ className }: { className: string }) {
  return (
    <form action={signOut} className="contents">
      <button type="submit" className={className}>
        Log out
      </button>
    </form>
  );
}

/**
 * A plain `img`, not `next/image`: the optimizer would need `avatars.githubusercontent.com` in
 * `remotePatterns` and would then proxy a file GitHub's own CDN already sizes and caches.
 *
 * `image` is nullable in the schema. Every row carries one today, because Better Auth writes
 * `profile.avatar_url` at sign-up, but initials cost less than a broken image in the header.
 */
function Avatar({ image, name }: { image?: string | null; name: string }) {
  const shape = "h-8 w-8 shrink-0 rounded-full border border-line";

  if (!image)
    return (
      <span
        className={`${shape} flex items-center justify-center bg-surface-raised font-mono text-[0.6875rem] text-ink-muted`}
      >
        {initials(name)}
      </span>
    );

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={avatarSrc(image)}
      alt=""
      width={32}
      height={32}
      className={`${shape} object-cover`}
    />
  );
}
