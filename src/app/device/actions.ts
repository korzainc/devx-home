"use server";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";
import { CLAIM_COOKIE, CLAIM_COOKIE_MAX_AGE_SECONDS } from "./claim-cookie";

// The claimed code travels from `claimDeviceCode` to the confirm screen in this cookie, never
// in the URL - a query parameter can end up in browser history, a Referer header, or a proxy
// log. httpOnly keeps it off `document.cookie`, and the short lifetime bounds how long it sits
// readable to roughly the time it takes to read the confirm screen.
//
// It's also the only thing `approveDeviceLogin`/`denyDeviceLogin` trust for which code to act
// on, never a value posted from the form, so a forged field can't act on an unclaimed code.
async function setClaimCookie(userCode: string) {
  (await cookies()).set(CLAIM_COOKIE, userCode, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: CLAIM_COOKIE_MAX_AGE_SECONDS,
    path: "/device",
  });
}

async function clearClaimCookie() {
  (await cookies()).delete({ name: CLAIM_COOKIE, path: "/device" });
}

/**
 * The code this session claimed, or a redirect to the error state if there isn't one.
 *
 * Approve and deny gate on this, not on whatever `userCode` a form posts - the cookie is
 * the one thing a stale tab or a forged request can't produce on its own.
 */
async function requireClaimedCode(): Promise<string> {
  const userCode = (await cookies()).get(CLAIM_COOKIE)?.value;
  if (!userCode) redirect("/device?error=1");
  return userCode;
}

// Matches the window/count of Better Auth's own device rate limiter (see routes.mjs's
// `rateLimit` entry for "/device"), which this bypasses by calling `deviceVerify` through
// `auth.api` directly rather than that HTTP route.
const CLAIM_RATE_LIMIT_MAX = 5;

/**
 * Insert-then-count: each query commits on its own, so whichever concurrent request counts
 * last already sees every prior insert, including its own. A tie rejects both requests,
 * never lets an extra one through.
 *
 * A rejected attempt deletes its own row right after, so retrying doesn't push this user's
 * lockout window forward.
 */
async function recordClaimAttemptIsWithinLimit(
  userId: string,
): Promise<boolean> {
  const {
    rows: [attempt],
  } = await getPool().query<{ id: string }>(
    `insert into "deviceClaimAttempt" ("id", "userId") values ($1, $2) returning "id"`,
    [randomUUID(), userId],
  );
  // Opportunistic cleanup, piggybacking on a write that's already happening - mirrors the
  // deviceCode cleanup in auth.ts. Rows older than an hour are well past the 30-minute window
  // this checks.
  await getPool()
    .query(
      `delete from "deviceClaimAttempt" where "createdAt" < now() - interval '1 hour'`,
    )
    .catch((error) =>
      console.error("Could not clean up stale device claim attempts.", error),
    );

  const { rows } = await getPool().query<{ count: number }>(
    `select count(*)::int as count
       from "deviceClaimAttempt"
      where "userId" = $1
        and "createdAt" > now() - interval '30 minutes'`,
    [userId],
  );
  const withinLimit = (rows[0]?.count ?? 0) <= CLAIM_RATE_LIMIT_MAX;
  if (!withinLimit) {
    await getPool().query(`delete from "deviceClaimAttempt" where "id" = $1`, [
      attempt.id,
    ]);
  }
  return withinLimit;
}

/**
 * Claims the code for the signed-in caller (`deviceVerify` binds `userCode` to whoever's
 * session made the request), then sends them to the confirm step. An `APIError` here just
 * means the code is wrong or expired; rate-limited before `deviceVerify` runs, since that
 * call is otherwise the only guard against someone guessing codes until one lands.
 *
 * `deviceVerify` doesn't throw for a code already claimed by someone else, or already
 * approved/denied - it returns a `status`/`client_id` that say so instead. `client_id` is
 * only present when this session now owns the code and it's still pending; anything else
 * means there's nothing for this session to approve or deny.
 */
export async function claimDeviceCode(formData: FormData) {
  const rawUserCode = formData.get("userCode");
  if (typeof rawUserCode !== "string") return;
  // Trimmed and uppercased before this goes anywhere: a pasted code with stray
  // whitespace or lowercase letters still matches server-side, but the raw form
  // of it would otherwise end up in the claim cookie and on the confirm screen.
  const userCode = rawUserCode.trim().toUpperCase();
  if (!userCode) return;

  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) redirect("/device?error=1");

  if (!(await recordClaimAttemptIsWithinLimit(session.user.id))) {
    // Deliberately the same "that code didn't work" the wrong-code case shows, not a distinct
    // "you're rate-limited" message - telling an attacker guessing codes that they've been
    // throttled is itself a small signal worth not giving away.
    redirect("/device?error=1");
  }

  let result: { status?: string; client_id?: string };
  try {
    result = await getAuth().api.deviceVerify({
      query: { user_code: userCode },
      headers: requestHeaders,
    });
  } catch (err) {
    if (err instanceof APIError) {
      redirect("/device?error=1");
    }
    throw err;
  }

  if (result.status !== "pending" || result.client_id === undefined) {
    redirect("/device?error=1");
  }

  await setClaimCookie(userCode);
  redirect("/device");
}

export async function approveDeviceLogin() {
  const userCode = await requireClaimedCode();
  try {
    await getAuth().api.deviceApprove({
      body: { userCode },
      headers: await headers(),
    });
  } catch (err) {
    if (err instanceof APIError) {
      await clearClaimCookie();
      redirect("/device?error=1");
    }
    throw err;
  }
  await clearClaimCookie();
  redirect("/device/done?outcome=approved");
}

export async function denyDeviceLogin() {
  const userCode = await requireClaimedCode();
  try {
    await getAuth().api.deviceDeny({
      body: { userCode },
      headers: await headers(),
    });
  } catch (err) {
    if (err instanceof APIError) {
      await clearClaimCookie();
      redirect("/device?error=1");
    }
    throw err;
  }
  await clearClaimCookie();
  redirect("/device/done?outcome=denied");
}

/** Abandons a stale claim so the person can type a different code instead. */
export async function discardDeviceClaim() {
  await clearClaimCookie();
  redirect("/device");
}
