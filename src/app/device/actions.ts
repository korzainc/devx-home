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
// log, any of which would hand an observer a code to approve under someone else's session.
// httpOnly keeps it off `document.cookie`; the short lifetime bounds how long a code sits
// readable in a cookie jar to roughly the time it takes to read the confirm screen. It is also
// the only thing `approveDeviceLogin`/`denyDeviceLogin` below trust for which code to act on -
// never a value posted from the form - so a stale or forged form field can't act on a code this
// session never claimed.
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
 * Approve and deny both gate on this rather than on whatever `userCode` a form posts - the
 * cookie is the one thing a stale tab or a forged request can't produce on its own.
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

async function claimAttemptsInWindow(userId: string): Promise<number> {
  const { rows } = await getPool().query<{ count: number }>(
    `select count(*)::int as count
       from "deviceClaimAttempt"
      where "userId" = $1
        and "createdAt" > now() - interval '30 minutes'`,
    [userId],
  );
  return rows[0]?.count ?? 0;
}

async function recordClaimAttempt(userId: string): Promise<void> {
  await getPool().query(
    `insert into "deviceClaimAttempt" ("id", "userId") values ($1, $2)`,
    [randomUUID(), userId],
  );
}

/**
 * Claims the code for the signed-in caller (`deviceVerify` binds `userCode` to whoever's
 * session is attached to this request), then sends them to the confirmation step. Any
 * `APIError` here means the code is wrong or expired - the response doesn't need to distinguish
 * those for the person typing it in.
 *
 * `deviceVerify` doesn't throw for a code that's already claimed by someone else, or already
 * approved/denied - it returns normally with a `status`/`client_id` that say so. `client_id`
 * is only present when this session is the one the code is now bound to and the request is
 * still `"pending"`; anything else means there is nothing for this session to approve or deny.
 *
 * Rate-limited per caller before `deviceVerify` ever runs, since that call is otherwise the only
 * guard against someone signed in just guessing codes until one lands on a pending request.
 */
export async function claimDeviceCode(formData: FormData) {
  const userCode = formData.get("userCode");
  if (typeof userCode !== "string" || !userCode) return;

  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) redirect("/device?error=1");

  if ((await claimAttemptsInWindow(session.user.id)) >= CLAIM_RATE_LIMIT_MAX) {
    redirect("/device?error=1");
  }
  await recordClaimAttempt(session.user.id);

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
