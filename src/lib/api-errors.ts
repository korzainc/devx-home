/**
 * `/api/*` is gated twice: `src/proxy.ts`'s blanket check, and a route's own, deeper check,
 * for defense in depth. Both must report the same reason for the same cause, since the CLI
 * switches on `reason` as a contract - so both live here once instead of copies that can drift.
 */
export type ApiErrorReason =
  | "unauthenticated"
  | "not_org_member"
  | "github_reauth_required"
  | "rate_limited"
  | "unavailable";

export const UNAUTHENTICATED_MESSAGE = "Log in with GitHub to continue.";
export const NOT_ORG_MEMBER_MESSAGE =
  "You're not a member of the Korza GitHub organization.";
export const GITHUB_REAUTH_REQUIRED_MESSAGE =
  "Your GitHub access needs refreshing. Sign in again on the website.";
export const UNAVAILABLE_MESSAGE =
  "devx-home couldn't verify your session right now. Try again in a moment.";

// `rate_limited` has no entry: its message is GitHub's own error text, not one fixed string, so
// it is tagged on a plain `Response.json` at the call site instead of going through `apiError`.
type FixedReason = Exclude<ApiErrorReason, "rate_limited">;

const MESSAGE_BY_REASON: Record<FixedReason, string> = {
  unauthenticated: UNAUTHENTICATED_MESSAGE,
  not_org_member: NOT_ORG_MEMBER_MESSAGE,
  github_reauth_required: GITHUB_REAUTH_REQUIRED_MESSAGE,
  unavailable: UNAVAILABLE_MESSAGE,
};

/** The one response for a given reason, so a reason can't be paired with two different
 * messages depending on which call site produced it. */
export function apiError(reason: FixedReason, status: number): Response {
  return Response.json(
    { error: MESSAGE_BY_REASON[reason], reason },
    { status },
  );
}
