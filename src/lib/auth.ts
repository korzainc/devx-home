import type { BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from "better-auth/api";
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
    // token itself - fine for a browser holding only the session cookie, not once bearer (below)
    // lets that same session travel as a header value a CLI can log or leak. Nobody calls these
    // today, so closing them costs nothing.
    //
    // `/device` (the plugin's bare GET claim endpoint - `/device/code`, `/device/token`,
    // `/device/approve` and `/device/deny` are untouched) claims a user_code from whatever
    // session cookie is on the request, needs no cookie to reach it, and GET skips the
    // origin-check middleware - so an attacker's page can make a victim's browser claim the
    // attacker's code with a plain navigation. `claimDeviceCode` (src/app/device/actions.ts)
    // calls `deviceVerify` directly through `auth.api`, bypassing this route entirely, so
    // disabling it here doesn't touch the real claim flow.
    disabledPaths: [
      "/get-access-token",
      "/refresh-token",
      "/account-info",
      "/device",
    ],
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
    session: {
      additionalFields: {
        // Which flow created this session. `input: false`: a client-set value here would let a
        // request mislabel its own session as device-issued.
        source: { type: "string", required: false, input: false },
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
      // both a plain form post rather than a client component. Must stay last in `plugins`: its
      // own `after` hook forwards whatever Set-Cookie header is on the response when it runs,
      // and a later plugin's `after` hook could change that header after it already read it.
      // (Bearer's own `after` hook only adds a `set-auth-token` header, not a Set-Cookie - this
      // ordering isn't about bearer specifically.)
      nextCookies(),
    ],
    hooks: {
      // Defense in depth, not the enforcement boundary: /api/analyze checks membership on every
      // request regardless of this hook. This is here so an approval itself can't hand a CLI a
      // long-lived session for someone who isn't a Korza org member.
      //
      // Must fail closed on no session, not return. User-level `hooks.before` runs before any
      // plugin's, including bearer's own `before` hook that turns an Authorization header into
      // the cookie `getSession` can see - so a bearer-only request still looks session-less here
      // even though it carries a real session. Returning instead of throwing would let it fall
      // through to device-authorization's own cookie-only check unexamined.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/device/code") {
          // The plugin accepts an optional `user_id` in this body and stores it as the device
          // code's owner with no authentication, which skips the "type the code to claim it" step
          // the two-step confirm flow depends on. The CLI never sends this field.
          if (ctx.body?.user_id) {
            throw new APIError("BAD_REQUEST", {
              message: "user_id is not accepted on this endpoint",
            });
          }
          // This endpoint needs no auth, so an abandoned or scripted request leaves a row the
          // plugin itself only ever deletes on a later poll. Opportunistic rather than a cron job:
          // piggybacks on the one request every device login already makes here.
          await getPool()
            .query(
              `delete from "deviceCode" where "expiresAt" < now() - interval '1 day'`,
            )
            .catch((error) =>
              console.error("Could not clean up stale device codes.", error),
            );
          return;
        }
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
          throw new APIError("FORBIDDEN", {
            message: "not a Korza org member",
          });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        // The plugin bakes the user code into `verification_uri_complete`'s query string, but
        // /device deliberately ignores that query param (see src/app/device/page.tsx) to avoid a
        // phishing link and keep the code out of browser history/referrers. Strip the field so a
        // naive client can't defeat that by opening it directly.
        if (ctx.path === "/device/code") {
          const body = ctx.context.returned;
          if (
            body &&
            typeof body === "object" &&
            "verification_uri_complete" in body
          ) {
            delete (body as Record<string, unknown>).verification_uri_complete;
          }
          return;
        }
        if (ctx.path !== "/get-session") return;
        // getSession's own refresh-on-expiry logic extends expiresAt back out toward the global
        // 7-day default whenever a session nears expiry, so an actively-polled device session
        // would never truly expire. A `hooks.before` can't pre-empt this: it runs before
        // bearer's own before-hook turns the CLI's Authorization header into the cookie this
        // lookup needs, so clamping has to happen here, after the real handler ran.
        //
        // `ctx.context.session`'s `expiresAt` isn't updated by that refresh - only the JSON body
        // is - so `token`, `createdAt` and `source` are reliable but `expiresAt` isn't.
        const session = ctx.context.session;
        if (!session || session.session.source !== "device") return;
        const body = ctx.context.returned;
        const bodySession =
          body && typeof body === "object" && "session" in body
            ? (body as { session?: { expiresAt?: Date } }).session
            : undefined;
        const returnedExpiresAt =
          bodySession?.expiresAt ?? session.session.expiresAt;
        const cap = new Date(
          new Date(session.session.createdAt).getTime() +
            DEVICE_SESSION_EXPIRES_IN_MS,
        );
        if (returnedExpiresAt.getTime() <= cap.getTime()) return;
        await ctx.context.internalAdapter.updateSession(session.session.token, {
          expiresAt: cap,
        });
        if (bodySession) bodySession.expiresAt = cap;
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
                source: "device",
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
