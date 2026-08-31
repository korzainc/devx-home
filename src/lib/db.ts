import { Pool } from "pg";

// Neon hands out connection strings ending in `sslmode=require`. Today `pg` reads that as
// `verify-full`, but pg 9 switches it to libpq semantics, where `require` encrypts without
// verifying the certificate at all. Pinning the mode here rather than in the env var means a
// `vercel env pull` overwriting the string with Neon's default cannot quietly undo it.
function verifyingTls(connectionString: string) {
  const url = new URL(connectionString);
  url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}

let pool: Pool | undefined;

/**
 * The pooled connection, shared by Better Auth and everything else that reads the database.
 *
 * Built on first use, not on import. `next build` imports every route to collect its config, and a
 * module that reads DATABASE_URL while being imported makes the build require a runtime secret.
 *
 * `DATABASE_URL` is Neon's transaction pooler. Schema changes go through DATABASE_URL_UNPOOLED
 * instead, because a transaction-mode pooler breaks session-level statements.
 */
export function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");

  return (pool = new Pool({
    connectionString: verifyingTls(connectionString),
  }));
}
