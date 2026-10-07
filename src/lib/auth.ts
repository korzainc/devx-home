import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { bearer } from "better-auth/plugins/bearer";
import { deviceAuthorization } from "better-auth/plugins/device-authorization";
import { getPool } from "./db";

// Sign-in runs through the Korza DevX GitHub App, not a classic OAuth App, which is what makes
// read-only private access possible: an OAuth App's `repo` scope is all-or-nothing read/write.
//
// The App issues user-to-server tokens that expire after 8 hours and refresh with a single-use
// token valid 6 months. Storing those needs a database rather than a cookie, which is why the
// account table exists at all.

function create() {
  return betterAuth({
    database: getPool(),
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
  });
}

let instance: ReturnType<typeof create> | undefined;

// Built on first use, not on import. `next build` imports every route to collect its config, and
// a module that reads DATABASE_URL while being imported makes the build require a runtime secret.
export function getAuth() {
  return (instance ??= create());
}
