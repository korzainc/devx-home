import { headers } from "next/headers";
import { cache } from "react";
import { getAuth } from "./auth";

// `headers()` is read before `getAuth()` in both functions here, and the order matters. It is what
// tells Next this render is request-time, so during a prerender it bails out before anything has
// asked for a database connection.
//
// Memoised per request, because the header renders the signed-in state twice: once in the wide
// nav and once inside the narrow-width menu, only one of which is ever visible. Without this that
// is two session round trips to Neon to draw one name.
export const getSession = cache(async () => {
  const requestHeaders = await headers();
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
  const auth = getAuth();
  // Reuses the cached lookup above instead of calling auth.api.getSession again. Checked
  // before listUserAccounts, which throws rather than returning nothing when there's no session.
  const session = await getSession();
  if (!session) return null;

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
