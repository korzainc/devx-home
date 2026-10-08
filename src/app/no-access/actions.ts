"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { getAuth } from "@/lib/auth";
import { getPool } from "@/lib/db";

/**
 * The explicit, POST-only counterpart to the read-only render in page.tsx - mutating here,
 * not there, keeps a retried request, a restored tab, or a speculative prerender from
 * denying a code the person still meant to approve.
 *
 * Re-reads the session and re-queries pending codes rather than trusting anything the page
 * already computed, so this only ever acts on this account's own, still-pending codes.
 */
export async function cancelPendingDeviceCode() {
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) redirect("/no-access");

  const { rows } = await getPool().query<{ userCode: string }>(
    `select "userCode" from "deviceCode"
      where "userId" = $1 and "status" = 'pending' and "expiresAt" > now()`,
    [session.user.id],
  );
  await Promise.all(
    rows.map(({ userCode }) =>
      getAuth()
        .api.deviceDeny({ body: { userCode }, headers: requestHeaders })
        .catch((err) => {
          // Already denied/expired/claimed by the time this runs - nothing left to cancel.
          if (!(err instanceof APIError)) throw err;
        }),
    ),
  );
  redirect(rows.length === 0 ? "/no-access" : "/no-access?cancelled=1");
}
