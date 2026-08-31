import { headers } from "next/headers";
import { getAuth } from "./auth";

// `headers()` is read before `getAuth()` in both functions here, and the order matters. It is what
// tells Next this render is request-time, so during a prerender it bails out before anything has
// asked for a database connection.
export async function getSession() {
  const requestHeaders = await headers();
  return getAuth().api.getSession({ headers: requestHeaders });
}

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
  // Checked before listing accounts, which throws rather than returning nothing when the
  // request carries no session.
  const session = await auth.api.getSession({ headers: requestHeaders });
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
