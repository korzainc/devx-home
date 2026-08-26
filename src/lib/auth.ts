import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "pg";

// Sign-in runs through the Korza DevX GitHub App, not a classic OAuth App, which is what makes
// read-only private access possible: an OAuth App's `repo` scope is all-or-nothing read/write.
//
// The App issues user-to-server tokens that expire after 8 hours and refresh with a single-use
// token valid 6 months. Storing those needs a database rather than a cookie, which is why the
// account table exists at all.

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set.");
}

export const auth = betterAuth({
  database: new Pool({ connectionString: process.env.DATABASE_URL }),
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
  // Lets the sign-in and sign-out server actions set and clear the session cookie, which keeps
  // both a plain form post rather than a client component.
  plugins: [nextCookies()],
});
