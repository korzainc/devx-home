import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { bearer } from "better-auth/plugins/bearer";
import { deviceAuthorization } from "better-auth/plugins/device-authorization";
import { getPool } from "./db";
import { isOrgMember, type StoredMembership } from "./membership";

// Sign-in runs through the Korza DevX GitHub App, not a classic OAuth App, which is what makes
// read-only private access possible: an OAuth App's `repo` scope is all-or-nothing read/write.
//
// The App issues user-to-server tokens that expire after 8 hours and refresh with a single-use
// token valid 6 months. Storing those needs a database rather than a cookie, which is why the
// account table exists at all.

// A CLI session, unlike the website's own, isn't something people run every day - 30 days keeps
// `korza ci-coverage` working for a typical gap between invocations without landing the person
// back in the device-code flow each time.
const DEVICE_SESSION_EXPIRES_IN_MS = 30 * 24 * 60 * 60 * 1000;

// Exported so tests can build a real instance against better-auth/adapters/memory instead of the
// Postgres pool - the hook pipeline below only proves anything when it actually runs.
export function createAuth(database: BetterAuthOptions["database"]) {
  return betterAuth({
    database,
    // `/get-access-token`, `/refresh-token` and `/account-info` hand back the encrypted GitHub
    // token itself, not just a session verdict. Fine for a browser that only ever holds the
    // session cookie; not fine once bearer (below) lets that same session travel as a header
    // value a CLI can be made to log or leak. Nobody calls these today, so closing them costs
    // nothing. `disabledPaths` is a top-level option, not something a plugin itself accepts -
    // see better-auth's dist/api/index.mjs onRequest handler.
    disabledPaths: ["/get-access-token", "/refresh-token", "/account-info"],
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_APP_CLIENT_ID ?? "",
        clientSecret: process.env.GITHUB_APP_CLIENT_SECRET ?? "",
        // A GitHub App user token carries no scopes at all: reach comes from the App's own
        // permissions and where it is installed. Asking for read:user and user:email would be
        // noise on the consent screen for something GitHub ignores.
        disableDefaultScope: true,
        mapProfileToUser: (profile) => ({
          // The App holds no Email Addresses account permission, so /user/emails is forbidden and
          // /user only reveals an email the person made public. Better Auth needs one, and the
          // noreply form is the address GitHub itself substitutes when an account keeps it private.
          email: profile.email ?? `${profile.login}@users.noreply.github.com`,
        }),
      },
    },
    account: {
      // The stored GitHub token is the reason someone signs in, so it does not sit in plaintext.
      // Tied to BETTER_AUTH_SECRET: changing that secret orphans every stored token.
      encryptOAuthTokens: true,
    },
    user: {
      // Declared here so `getSession` returns them on the user it already fetched. Reading the
      // column separately would be a second query on every gated request to learn something the
      // first one had in hand.
      //
      // `input: false` on both: these are the gate's own verdict, and a field the client can send
      // is a field the client can set to true.
      additionalFields: {
        orgMember: { type: "boolean", defaultValue: false, input: false },
        orgCheckedAt: { type: "date", required: false, input: false },
      },
    },
    plugins: [
      // Lets a bearer token stand in for the session cookie, so `korza ci-coverage` can carry a
      // session the same way a browser's cookie jar does, with no separate token table or route.
      bearer(),
      // RFC 8628 device-code login for the CLI: open a browser, type a code, approve.
      deviceAuthorization({
        // Relative: the plugin resolves it against baseURL. getSetupOrigin() can return null
        // mid-request, which would make an absolute URL here wrong some of the time.
        verificationUri: "/device",
        validateClient: (id) => id === "korza-cli",
        // expiresIn deliberately omitted: the library's own default is already the string
        // "30m". Passing a number instead fails the plugin's zod schema and throws inside
        // getAuth() at request time - every sign-in on the site, not just the CLI's.
      }),
      // Sets and clears the session cookie for the sign-in/sign-out server actions, which keeps
      // both a plain form post rather than a client component. Must stay last: bearer's `after`
      // hook runs after this one only while this one is last, and that's what forwards its
      // Set-Cookie into Next's cookie store.
      nextCookies(),
    ],
    hooks: {
      // Defense in depth, not the enforcement boundary: /api/analyze checks membership on every
      // request regardless of this hook. This is here so an approval itself can't hand a CLI a
      // long-lived session for someone who isn't a Korza org member.
      //
      // Must fail closed on no session, not return. User-level `hooks.before` runs before
      // plugin-level ones (see better-auth's dist/api/dispatch.mjs `getHooks`), and bearer's own
      // `before` hook - the thing that turns an Authorization header into a cookie `getSession`
      // can see - is plugin-level. So a bearer-only request looks session-less here even though
      // it carries a real session; returning instead of throwing would let it fall through to
      // device-authorization's own cookie-only check and sail past this one unexamined.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/device/approve") return;
        const session = await getSessionFromCtx(ctx);
        if (!session) {
          throw new APIError("UNAUTHORIZED", { message: "sign in first" });
        }
        // getSessionFromCtx is generic over `better-auth/api`, not this instance's own options,
        // so its User type doesn't know about the orgMember/orgCheckedAt additional fields below -
        // they're on the object at runtime, just not in this standalone helper's return type.
        const user = session.user as typeof session.user & StoredMembership;
        if (!(await isOrgMember(ctx.headers ?? new Headers(), user))) {
          throw new APIError("FORBIDDEN", { message: "not a Korza org member" });
        }
      }),
    },
    databaseHooks: {
      session: {
        create: {
          // Scoped to /device/token so the website's own, shorter-lived browser sessions are
          // untouched. Overriding expiresAt here (rather than updating the row after `createSession`
          // returns) means the expires_in the plugin reports back to the CLI is already correct,
          // since it's computed from this same, already-overridden value.
          before: async (session, ctx) => {
            if (ctx?.path !== "/device/token") return;
            return {
              data: {
                ...session,
                expiresAt: new Date(Date.now() + DEVICE_SESSION_EXPIRES_IN_MS),
              },
            };
          },
        },
      },
    },
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

// Built on first use, not on import. `next build` imports every route to collect its config, and
// a module that reads DATABASE_URL while being imported makes the build require a runtime secret.
export function getAuth() {
  return (instance ??= createAuth(getPool()));
}
