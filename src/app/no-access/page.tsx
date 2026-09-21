import type { Metadata } from "next";
import { signOut } from "@/lib/auth-actions";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "No access",
  description:
    "Korza DevX is for the Korza team. Ask to be added to the Korza GitHub organisation, or log in with a different account.",
};

/**
 * Where the gate sends somebody who signed in successfully and is still not allowed in.
 *
 * Kept apart from `/login` because the two are different problems and the remedy is different. A
 * signed-out visitor needs to log in; this visitor has already done that, and logging in again
 * would hand back the same account and the same answer. What they need is either a different
 * account or somebody to add this one to the organisation.
 *
 * Open in `src/lib/gate.ts`, which it has to be: the whole point is that its reader cannot satisfy
 * the gate, so gating this page would bounce them back here forever.
 *
 * The session read is why this is dynamic. Naming the account is most of the page's value, because
 * the common case is not an outsider at all, it is somebody with two GitHub accounts who arrived
 * on the personal one.
 */
export const instant = false;

export default async function NoAccessPage() {
  const session = await getSession();

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-7 py-10 text-center">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
        This account cannot open Dev<span className="text-accent">X</span>
      </h1>

      <p className="text-sm leading-relaxed text-ink-muted">
        Korza DevX is for the Korza team. Logging in worked, but this account is
        not in the Korza GitHub organisation, so there is nothing here it can
        read yet.
      </p>

      {session ? (
        <div className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-left">
          <p className="text-xs text-ink-faint">Logged in as</p>
          <p className="truncate text-sm text-ink">{session.user.name}</p>
          <p className="truncate text-xs text-ink-faint">
            {session.user.email}
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 text-sm leading-relaxed text-ink-muted">
        <p>
          If you are on the team, ask someone to add this GitHub account to the
          Korza organisation. Access follows your GitHub access to Korza, so it
          works within a minute of being added.
        </p>
        <p>
          {/* The reason the account is named above. Two-account confusion is the likeliest way
              to arrive here, and it is fixed by the button rather than by asking anybody. */}
          If you have a second GitHub account that is on the team, log out and
          use that one instead.
        </p>
      </div>

      <form action={signOut}>
        <button
          type="submit"
          className="rounded-lg border border-line-strong bg-surface-raised px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-ink-faint"
        >
          Log out
        </button>
      </form>
    </div>
  );
}
