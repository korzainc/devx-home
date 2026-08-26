"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export async function signInWithGitHub() {
  const { url } = await auth.api.signInSocial({
    body: { provider: "github", callbackURL: "/" },
    headers: await headers(),
  });
  if (!url) throw new Error("GitHub did not return an authorization URL.");
  redirect(url);
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/");
}
