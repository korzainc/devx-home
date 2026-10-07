"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { getAuth } from "@/lib/auth";

/**
 * Claims the code for the signed-in caller (`deviceVerify` binds `userCode` to whoever's
 * session is attached to this request), then sends them to the confirmation step. Any
 * `APIError` here means the code is wrong, expired, or already claimed by someone else -
 * the response doesn't need to distinguish those for the person typing it in.
 */
export async function claimDeviceCode(formData: FormData) {
  const userCode = formData.get("userCode");
  if (typeof userCode !== "string" || !userCode) return;
  try {
    await getAuth().api.deviceVerify({
      query: { user_code: userCode },
      headers: await headers(),
    });
  } catch (err) {
    if (err instanceof APIError) {
      redirect("/device?error=1");
    }
    throw err;
  }
  redirect(`/device?claimed=${encodeURIComponent(userCode)}`);
}

export async function approveDeviceLogin(formData: FormData) {
  const userCode = formData.get("userCode");
  if (typeof userCode !== "string" || !userCode) return;
  await getAuth().api.deviceApprove({
    body: { userCode },
    headers: await headers(),
  });
  redirect("/device/done");
}

export async function denyDeviceLogin(formData: FormData) {
  const userCode = formData.get("userCode");
  if (typeof userCode !== "string" || !userCode) return;
  await getAuth().api.deviceDeny({
    body: { userCode },
    headers: await headers(),
  });
  redirect("/device/done");
}
