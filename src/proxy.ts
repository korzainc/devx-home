import { NextResponse, type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";
import { isOpenPath } from "@/lib/gate";
import { isOrgMember } from "@/lib/membership";

/**
 * The gate. Every page and route handler needs a session *and* membership of the Korza
 * organisation, and `src/lib/gate.ts` holds the list of what needs neither.
 *
 * Two halves, because a session on its own is a weak claim: it proves somebody completed GitHub
 * sign-in, and all of GitHub can do that. `src/lib/membership.ts` is the half that asks whether
 * this is our organisation's person, and `src/lib/org.ts` is how it asks GitHub.
 *
 * `proxy`, not `middleware`: the file convention was renamed in Next 16 and the old name is
 * deprecated. It runs on the Node.js runtime, which is not configurable here and is what lets this
 * reach the database at all.
 *
 * The check is the database-backed session rather than Better Auth's `getSessionCookie`, which
 * only reports whether a cookie of that name is present. Anybody can set a cookie, so that is a
 * redirect for the signed-out, not a gate. Verifying the signed cookie cache would save the query,
 * but the cache expires on a clock of its own, and a reader whose cache had lapsed would be sent
 * to the sign-in page while still holding a good session.
 *
 * So this costs one query per request. Fine for a portal with an internal audience, and the reason
 * it is worth stating is that it fails closed: while the database cannot answer, nobody gets in.
 *
 * One query, still, now that membership is checked too: the verdict is a column on the user row
 * that `getSession` already returns, and only a stale one costs anything more.
 *
 * Closed, but not by throwing. `getAuth` builds the connection pool and so throws outright with no
 * DATABASE_URL, which turned every gated path into a 500 that reads as a bug rather than as a
 * locked door. An outage deserves the same treatment. Either way the answer to "is this person
 * signed in" is no, and the sign-in page is the honest place to land.
 *
 * The consequence is worth knowing before it bites: `next dev` now needs the Vercel environment
 * pulled before the site is browsable at all, where before this the catalogue and the roadmap
 * rendered without a database. Opening the gate when auth is unconfigured would give that back and
 * is exactly the wrong trade, because the same branch would open the whole site the day a
 * deployment lost the variable.
 */
export const config = {
  matcher: [
    // The build output only. Every decision about who may read what is in `isOpenPath`, where it
    // can be tested; this pattern exists because a gate that redirects the stylesheet renders the
    // sign-in page unstyled, which is not a policy question.
    "/((?!_next/static|_next/image).*)",
  ],
};

async function sessionFor(request: NextRequest) {
  try {
    return await getAuth().api.getSession({ headers: request.headers });
  } catch (error) {
    // Reported rather than swallowed: the redirect below is indistinguishable from a signed-out
    // visitor, so without this an outage looks like everybody deciding to sign out at once.
    console.error("The gate could not read a session.", error);
    return null;
  }
}

export default async function proxy(request: NextRequest) {
  const { pathname, search, origin } = request.nextUrl;
  if (isOpenPath(pathname)) return NextResponse.next();

  const session = await sessionFor(request);
  if (!session) {
    const login = new URL("/login", origin);
    // Read back by the login form's hidden field, and washed by `callbackFrom` before it is used.
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  // A session only says somebody has a GitHub account, and anybody can have one of those. This is
  // the half that says whose portal it is.
  if (await isOrgMember(request.headers, session.user)) {
    return NextResponse.next();
  }

  // Signed in and not one of us, which is a different answer from signed out and so a different
  // page. Sending these visitors to `/login` would loop: they have a valid session already, and
  // signing in again would produce the same one.
  return NextResponse.redirect(new URL("/no-access", origin));
}
