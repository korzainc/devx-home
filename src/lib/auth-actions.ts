"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/**
 * Where to land after GitHub sends the user back. Anything but a same-origin path is discarded:
 * `//host` and `/\host` are both protocol-relative and would hand the browser to another site,
 * which is the whole shape of an open redirect. Better Auth checks `callbackURL` itself, but only
 * for requests that reach it over HTTP, and calling `auth.api` directly does not.
 */
function callbackFrom(formData: FormData): string {
  const next = formData.get("next");
  if (typeof next !== "string" || !next.startsWith("/")) return "/";
  if (next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

export async function signInWithGitHub(formData: FormData) {
  const { url } = await auth.api.signInSocial({
    body: { provider: "github", callbackURL: callbackFrom(formData) },
    headers: await headers(),
  });
  if (!url) throw new Error("GitHub did not return an authorization URL.");
  redirect(url);
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}
