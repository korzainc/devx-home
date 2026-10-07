"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { getAuth } from "@/lib/auth";

// The claimed code travels from `claimDeviceCode` to the confirm screen in this cookie, never
// in the URL - a query parameter can end up in browser history, a Referer header, or a proxy
// log, any of which would hand an observer a code to approve under someone else's session.
// httpOnly keeps it off `document.cookie`; the short lifetime bounds how long a code sits
// readable in a cookie jar to roughly the time it takes to read the confirm screen.
const CLAIM_COOKIE = "device_claim";
const CLAIM_COOKIE_MAX_AGE_SECONDS = 5 * 60;

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
 * Claims the code for the signed-in caller (`deviceVerify` binds `userCode` to whoever's
 * session is attached to this request), then sends them to the confirmation step. Any
 * `APIError` here means the code is wrong or expired - the response doesn't need to distinguish
 * those for the person typing it in.
 *
 * `deviceVerify` doesn't throw for a code that's already claimed by someone else, or already
 * approved/denied - it returns normally with a `status`/`client_id` that say so. `client_id`
 * is only present when this session is the one the code is now bound to and the request is
 * still `"pending"`; anything else means there is nothing for this session to approve or deny.
 */
export async function claimDeviceCode(formData: FormData) {
  const userCode = formData.get("userCode");
  if (typeof userCode !== "string" || !userCode) return;

  let result: { status?: string; client_id?: string };
  try {
    result = await getAuth().api.deviceVerify({
      query: { user_code: userCode },
      headers: await headers(),
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

export async function approveDeviceLogin(formData: FormData) {
  const userCode = formData.get("userCode");
  if (typeof userCode !== "string" || !userCode) return;
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

export async function denyDeviceLogin(formData: FormData) {
  const userCode = formData.get("userCode");
  if (typeof userCode !== "string" || !userCode) return;
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
