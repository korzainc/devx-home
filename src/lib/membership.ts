import { getAuth } from "./auth";
import { getPool } from "./db";
import { fetchOrgMembership } from "./org";

/**
 * The cached side of the membership check: when to trust the stored answer, when to ask GitHub
 * again, and what to conclude when GitHub cannot be asked.
 *
 * Asking GitHub on every request would put a network call in front of every page. Never asking
 * again would mean somebody who leaves the organisation keeps access until their row is deleted by
 * hand. So the verdict is stored with the time it was reached, and goes stale.
 */

// Twelve hours, which is a little longer than the 8 hour life of a GitHub access token, so the
// common case is one membership call per person per working day. The cost of the window is its
// own description: someone removed from the organisation keeps access for up to this long.
export const RECHECK_AFTER_MS = 12 * 60 * 60 * 1000;

// A no is held for far less time than a yes, because the two mistakes are not the same size.
// Trusting a stale yes lets somebody in who should be out; trusting a stale no keeps a colleague
// waiting after they have been added. So a refusal is retried almost immediately.
//
// Not zero, though, which is where this started. Re-checking on every request meant a non-member
// caused one GitHub call per request, and Next prefetches links on hover, so idly pointing at the
// footer fired several. A minute is short enough that being added feels immediate and long enough
// that a page and its prefetches cost one call.
export const RETRY_DENIED_AFTER_MS = 60 * 1000;

// `orgCheckedAt` is optional as well as nullable because that is how it reaches here: Better Auth
// types a non-required additional field as possibly absent, and the driver hands back a string
// where the session hands back a Date.
export type StoredMembership = {
  orgMember: boolean;
  orgCheckedAt?: Date | string | null;
};

/**
 * Whether the stored answer can be used as it stands.
 *
 * A null timestamp is never fresh, which is what re-checks the rows that existed before this
 * column did. A timestamp in the future is treated as fresh rather than as an error: clock skew
 * between the app and Postgres is real and small, and the alternative is re-checking on every
 * request for as long as the skew lasts.
 */
export function isFresh(
  checkedAt: Date | string | null | undefined,
  within: number,
  now: number = Date.now(),
): boolean {
  if (!checkedAt) return false;
  const at = checkedAt instanceof Date ? checkedAt : new Date(checkedAt);
  const ms = at.getTime();
  if (Number.isNaN(ms)) return false;
  return ms > now - within;
}

/**
 * The signed-in user's GitHub token, for callers that hold request headers directly.
 *
 * `src/lib/session.ts` has the same job for server components, where `headers()` is available and
 * the session lookup is memoised per request. The gate runs before any of that exists, so it
 * passes the request's headers in.
 */
async function tokenFor(headers: Headers): Promise<string | null> {
  const auth = getAuth();
  const accounts = await auth.api.listUserAccounts({ headers });
  const github = accounts?.find((account) => account.providerId === "github");
  if (!github) return null;

  const { accessToken } = await auth.api.getAccessToken({
    body: { accountId: github.id },
    headers,
  });
  return accessToken ?? null;
}

async function store(userId: string, orgMember: boolean) {
  await getPool().query(
    `update "user" set "orgMember" = $1, "orgCheckedAt" = now() where "id" = $2`,
    [orgMember, userId],
  );
}

/**
 * Whether this user may pass the gate, asking GitHub if the stored answer has gone stale.
 *
 * Never throws. The gate calls this on every request, and an exception here would be a 500 on
 * every page rather than a decision.
 *
 * The failure rule is the part worth reading. When GitHub cannot answer, a previously confirmed
 * member is let through and nothing is written, so a rate limit or an outage costs nobody their
 * access and the next request tries again. Somebody never confirmed is refused, because the
 * alternative is that an unreachable GitHub opens the site to anyone holding any account.
 */
export async function isOrgMember(
  headers: Headers,
  user: { id: string } & StoredMembership,
  options: { fresh?: boolean } = {},
): Promise<boolean> {
  const maxAge = user.orgMember ? RECHECK_AFTER_MS : RETRY_DENIED_AFTER_MS;
  if (!options.fresh && isFresh(user.orgCheckedAt, maxAge))
    return user.orgMember;

  try {
    const token = await tokenFor(headers);
    // No usable token is a real answer rather than a failure: without one there is no way to
    // establish membership, and the remedy is signing in again.
    if (!token) return false;

    const member = await fetchOrgMembership(token);
    // Storing is a cache write, not the verdict. Letting a failed write reach the catch below
    // would discard an answer GitHub had just given and fall back to the stale one, which for
    // somebody removed from the organisation means returning the yes they used to have.
    await store(user.id, member).catch((error) =>
      console.error("The gate reached a verdict it could not store.", error),
    );
    return member;
  } catch (error) {
    console.error("The gate could not check organisation membership.", error);
    return options.fresh ? false : user.orgMember;
  }
}
