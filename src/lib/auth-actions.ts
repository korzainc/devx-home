"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { localAuthOrigin } from "./local-auth-origin";

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
  // URL parsers discard tabs/newlines, so `/\t/host` can become `//host`.
  if (
    [...next].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
    )
  )
    return "/";
  return next;
}

export async function signInWithGitHub(formData: FormData) {
  const requestHeaders = await headers();
  const callbackURL = callbackFrom(formData);
  const authOrigin = localAuthOrigin(requestHeaders.get("host"));
  if (authOrigin) {
    // This action also appears on CI coverage. Select the callback host before
    // creating state, regardless of which page contains the sign-in form.
    const login = new URL("/login", authOrigin);
    login.searchParams.set("next", callbackURL);
    redirect(login.toString());
  }
  const { url } = await getAuth().api.signInSocial({
    body: { provider: "github", callbackURL },
    headers: requestHeaders,
  });
  if (!url) throw new Error("GitHub did not return an authorization URL.");
  redirect(url);
}

export async function signOut() {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/");
}
