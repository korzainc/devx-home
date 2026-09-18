/**
 * Whether the person signing in belongs to the Korza organisation.
 *
 * A session only proves somebody holds a GitHub account, and the portal is on the open internet,
 * so the session on its own lets in all of GitHub. This is the second half of the gate.
 *
 * The signal is `GET /user/installations`, which lists the installations of this App that the
 * token's owner can reach. The App is private and installed on one organisation, so seeing its
 * installation means belonging to that organisation. The two obvious endpoints were both measured
 * and neither works here:
 *
 * - `GET /user/orgs` returns `[]` even for a member, because membership is private and the App
 *   holds no Members permission. It would lock out everybody.
 * - `GET /user/memberships/orgs/{org}` answers 403 "Resource not accessible by integration" for
 *   the same missing permission. Granting it needs an organisation owner.
 *
 * So this is a proxy for membership rather than proof of it, and the gap is worth naming: GitHub
 * returns installations covering repositories reachable *through* an organisation, so an outside
 * collaborator on any repository in the installation also passes. Everyone in that position today
 * is someone already given access to private Korza code, which is why this is the right trade for
 * now, but it is not the same claim as "is an employee". If the App ever gains Members permission,
 * the membership endpoint above replaces `namesOrg` and closes it.
 */

// The organisation and the App are a pair. Matching the account alone would accept an installation
// of some *other* App on the same organisation, which a third party could arrange.
const ORG = "korzainc";
const APP = "korza-devx";

type Installation = {
  app_slug?: string;
  account?: { login?: string; type?: string } | null;
};

/**
 * Split from the request so the decision can be tested against real response shapes.
 *
 * Case-insensitive because GitHub preserves the case an organisation was named with but treats
 * logins as case-insensitive everywhere else, and `type` is checked so a personal account that
 * happens to be called `korzainc` cannot stand in for the organisation.
 */
export function namesOrg(installations: Installation[]): boolean {
  return installations.some(
    (installation) =>
      installation.app_slug === APP &&
      installation.account?.type === "Organization" &&
      installation.account?.login?.toLowerCase() === ORG,
  );
}

/**
 * Throws rather than returning false when GitHub cannot be asked.
 *
 * The distinction matters: "GitHub says no" is a verdict worth storing, and "GitHub did not
 * answer" must not be, or a rate limit would evict the whole company. The caller decides what to
 * do with the difference.
 */
export async function fetchOrgMembership(token: string): Promise<boolean> {
  const response = await fetch(
    "https://api.github.com/user/installations?per_page=100",
    {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
      // The gate awaits this, so a hung connection would hold a page request open. GitHub's own
      // timeout is far longer than anything worth waiting for in front of a redirect.
      signal: AbortSignal.timeout(5000),
    },
  );

  if (!response.ok) {
    throw new Error(
      `GitHub answered ${response.status} for /user/installations.`,
    );
  }

  const body: unknown = await response.json();
  const installations =
    body && typeof body === "object" && "installations" in body
      ? (body as { installations?: unknown }).installations
      : undefined;

  // A 200 whose shape is unrecognised is not a denial. Reaching `namesOrg` with an empty list
  // would store "not a member" off the back of an API change.
  if (!Array.isArray(installations)) {
    throw new Error("GitHub returned no installations array.");
  }

  return namesOrg(installations as Installation[]);
}
