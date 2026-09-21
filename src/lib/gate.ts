/**
 * Which paths answer without a session.
 *
 * The portal is internal and there is no VPN in front of it, so from here on sign-in is the only
 * thing between it and the open internet. That makes this list the whole security boundary, which
 * is why it lives in one pure function with tests rather than inside a matcher regex: the classic
 * way to leave a page open is to widen a pattern nobody can read.
 *
 * Everything not named here is shut, including every page a reader would think of as the portal.
 * What is named divides into two: the paths sign-in itself needs, and the two features that only
 * work without a cookie.
 *
 * Open here means "answers without a session", which is not the same as unguarded. A closed path
 * needs a session *and* organisation membership, and `src/lib/membership.ts` is the second half.
 */
const OPEN = [
  // The way in. Without this the redirect below has nowhere to send anybody.
  "/login",
  // Where the gate sends somebody signed in who is not in the organisation. Open because they
  // cannot satisfy the gate by definition, so gating the page that explains that is a loop.
  "/no-access",
  // GitHub's callback lands here, and it arrives before there is a session to show for it.
  "/api/auth",
  // Served by `src/app/icon.png` and friends as routes, so the gate sees them. A sign-in page
  // that redirects its own favicon is not broken, but it does put a failed request in the log of
  // everyone who looks.
  "/favicon.ico",
  "/icon.png",
  "/apple-icon.png",
  // The installer, fetched by `curl`, which carries no cookie and follows the gate's redirect to
  // the sign-in page. Gated, `curl | sh` pipes HTML into a shell, so this is not a login prompt
  // for the person running it, it is a broken install.
  "/setup",
  // The script `/setup` hands out, and the tarball and checksum it goes on to fetch. Static files
  // under `public/`, which the matcher does not exclude, so they need saying.
  "/korza",
  // Analyzes public repositories with no credential at all, which is the reason the anonymous
  // path through `src/lib/gap` exists. It leaks nothing it did not already read anonymously, and
  // the write side stays shut: `/api/analyze` is gated here and checks the session itself.
  //
  // The cost is that the deployment's 60-per-hour unauthenticated GitHub quota is now spendable
  // by anybody who finds the URL. That was true before the gate as well, and a signed-out visitor
  // exhausting it degrades this page rather than any other.
  "/ci-coverage",
];

export function isOpenPath(pathname: string): boolean {
  return OPEN.some(
    (open) => pathname === open || pathname.startsWith(`${open}/`),
  );
}
