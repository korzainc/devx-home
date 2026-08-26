import { headers } from "next/headers";
import { auth } from "./auth";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
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
