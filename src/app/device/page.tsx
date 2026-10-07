import type { Metadata } from "next";
import { cookies } from "next/headers";
import { signInWithGitHub } from "@/lib/auth-actions";
import { getSession } from "@/lib/session";
import {
  approveDeviceLogin,
  claimDeviceCode,
  denyDeviceLogin,
  discardDeviceClaim,
} from "./actions";
import { CLAIM_COOKIE } from "./claim-cookie";

export const metadata: Metadata = {
  title: "Approve CLI sign-in",
};

// Reads cookies() and searchParams, so it can't be prerendered.
export const instant = false;

/**
 * Two steps, not one: typing the code (`claimDeviceCode`) binds it to this session, and only
 * then does Approve/Deny appear. Never read the code from a query parameter or pre-fill the
 * input - a link with the code baked in would turn this into a one-click phishing approval
 * (RFC 8628 §5.4). The claimed code instead travels in a short-lived, httpOnly cookie that only
 * `claimDeviceCode` sets, so showing the confirm screen below can never be triggered by a URL
 * alone. Its mere presence is the gate - this never calls `deviceVerify` again here, since that
 * would claim a fresh code on every render instead of just checking one.
 */
export default async function DevicePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  const { error } = await searchParams;
  const claimed = (await cookies()).get(CLAIM_COOKIE)?.value;

  if (!session) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-7 py-10 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Approve the Korza CLI
        </h1>
        <p className="text-sm leading-relaxed text-ink-muted">
          Log in to approve a Korza CLI sign-in.
        </p>
        <form action={signInWithGitHub}>
          <input type="hidden" name="next" value="/device" />
          <button
            type="submit"
            className="rounded-lg border border-line-strong bg-surface-raised px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-ink-faint"
          >
            Log in with GitHub
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-7 py-10 text-center">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
        Approve the Korza CLI
      </h1>

      <div className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-left">
        <p className="text-xs text-ink-faint">Logged in as</p>
        <p className="truncate text-sm text-ink">{session.user.name}</p>
        <p className="truncate text-xs text-ink-faint">{session.user.email}</p>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-ink-muted">
          That code didn&apos;t work. Check it and try again.
        </p>
      ) : null}

      {claimed ? (
        <>
          <p className="text-sm leading-relaxed text-ink-muted">
            Approve sign-in for code{" "}
            <span className="font-mono font-semibold text-ink">{claimed}</span>?
          </p>
          <p className="text-sm leading-relaxed text-ink-muted">
            Only approve this if you just ran a Korza CLI command yourself. This
            signs the Korza CLI in as you for 30 days.
          </p>
          <form action={approveDeviceLogin} className="flex gap-3">
            <button
              type="submit"
              className="rounded-lg border border-line-strong bg-surface-raised px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-ink-faint"
            >
              Approve
            </button>
          </form>
          <form action={denyDeviceLogin}>
            <button type="submit" className="text-sm text-ink-muted underline">
              Deny
            </button>
          </form>
          <form action={discardDeviceClaim}>
            <button type="submit" className="text-sm text-ink-muted underline">
              Use a different code
            </button>
          </form>
        </>
      ) : (
        <form
          action={claimDeviceCode}
          className="flex w-full flex-col items-center gap-4"
        >
          <p className="text-sm leading-relaxed text-ink-muted">
            Enter the code your terminal showed.
          </p>
          <label htmlFor="userCode" className="sr-only">
            Device code
          </label>
          <input
            id="userCode"
            name="userCode"
            placeholder="WDJB-MJHT"
            required
            maxLength={9}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-center font-mono text-lg tracking-widest text-ink outline-none"
          />
          <button
            type="submit"
            className="rounded-lg border border-line-strong bg-surface-raised px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-ink-faint"
          >
            Continue
          </button>
        </form>
      )}
    </div>
  );
}
