/**
 * `/api/*` is gated twice: `src/proxy.ts`'s blanket check, and a route's own, deeper check (see
 * `src/app/api/analyze/route.ts`) for defense in depth. Both need to report the same reason for
 * the same cause, and the CLI's own code switches on `reason` (and prints `error`) as a contract -
 * so both live here once rather than as copies that can drift.
 */
export type ApiErrorReason =
  | "unauthenticated"
  | "not_org_member"
  | "github_reauth_required"
  | "rate_limited";

export const UNAUTHENTICATED_MESSAGE = "Log in with GitHub to continue.";
export const NOT_ORG_MEMBER_MESSAGE =
  "You're not a member of the Korza GitHub organization.";
export const GITHUB_REAUTH_REQUIRED_MESSAGE =
  "Your GitHub access needs refreshing. Sign in again on the website.";
