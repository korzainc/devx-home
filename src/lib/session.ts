import { headers } from "next/headers";
import { cache } from "react";
import { getAuth } from "./auth";

// Every prerequisite `getAuth()` needs before a session lookup will resolve. Better Auth reads its
// secret from BETTER_AUTH_SECRET, AUTH_SECRET or the versioned BETTER_AUTH_SECRETS, and rejects
// rather than warns when it finds none. The header renders on every page, so that rejection took
// the catalogue and the roadmap down with it, none of which need a session to render. DATABASE_URL
// on its own was not enough of a check: Vercel scopes the Neon variables to all three environments
// while the auth secret was production-only, and that pairing broke every preview.
//
// The secret is only required here where Better Auth itself requires it, which it keys off
// `NODE_ENV` and nothing else. Below that check `NODE_ENV` is what to read, never `VERCEL_ENV`:
// Vercel sets `NODE_ENV=production` on preview deployments too, so preview is exactly the case
// this has to cover, and narrowing the check to `VERCEL_ENV === "production"` would let previews
// back through to the rejection that broke them. Where Better Auth does not insist, it falls back
// to a built-in default and signs people in normally, so insisting everywhere would turn
// `next dev` against a database into a permanently signed-out session, silently.
//
// A malformed BETTER_AUTH_SECRETS still throws, and deliberately: anything but `<version>:<secret>`
// is a typo worth failing loudly over rather than quietly signing everyone out.
function authIsConfigured() {
  if (!process.env.DATABASE_URL) return false;
  if (process.env.NODE_ENV !== "production") return true;
  return Boolean(
    process.env.BETTER_AUTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.BETTER_AUTH_SECRETS,
  );
}

// `headers()` is read before `getAuth()` in both functions here, and the order matters. It is what
// tells Next this render is request-time, so during a prerender it bails out before anything has
// asked for a database connection.
//
// Memoised per request, because the header renders the signed-in state twice: once in the wide
// nav and once inside the narrow-width menu, only one of which is ever visible. Without this that
// is two session round trips to Neon to draw one name.
export const getSession = cache(async () => {
  const requestHeaders = await headers();
  // Covers local development without the Vercel environment and any deployment missing a piece of
  // the auth configuration. Nobody signed in is the honest answer when auth cannot be built at all.
  if (!authIsConfigured()) return null;
  return getAuth().api.getSession({ headers: requestHeaders });
});

/**
 * The signed-in user's GitHub token, refreshed first if the 8 hour access token has run out.
 *
 * Null covers both nobody being signed in and a refresh token that no longer works, because the
 * remedy is the same button either way. A refresh can fail for two reasons worth expecting: the
 * 6 month window closed, or a single-use refresh token was already spent by a concurrent request.
 */
export async function getGitHubToken(): Promise<string | null> {
  const requestHeaders = await headers();
  // Reuses the cached lookup above instead of calling auth.api.getSession again, and returns ahead
  // of `getAuth()`, which builds the connection pool and so throws synchronously with no
  // DATABASE_URL. Checked before listUserAccounts, which throws rather than returning nothing
  // when there is no session.
  const session = await getSession();
  if (!session) return null;

  const auth = getAuth();
  const accounts = await auth.api.listUserAccounts({ headers: requestHeaders });
  const github = accounts?.find((account) => account.providerId === "github");
  if (!github) return null;

  try {
    const { accessToken } = await auth.api.getAccessToken({
      body: { accountId: github.id },
      headers: requestHeaders,
    });
    return accessToken ?? null;
  } catch {
    return null;
  }
}
