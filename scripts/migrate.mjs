/**
 * Applies every migration in ./migrations that has not run yet, in filename order.
 *
 *   pnpm migrate                    apply against DATABASE_URL_UNPOOLED
 *   pnpm migrate --if-production    the same, but a no-op unless VERCEL_ENV is production
 *
 * Deliberately dependency-free and small enough to read in one sitting. It buys the four things
 * that matter and nothing else: an ordered ledger of what ran, a refusal to run a file twice, a
 * refusal to accept a file that changed after it ran, and a lock so two deploys cannot race.
 *
 * Runs against DATABASE_URL_UNPOOLED. Neon's pooler is transaction mode, which breaks the
 * session-level statements a migration is allowed to use, and the advisory lock below is held
 * across statements so it needs one connection it can keep.
 *
 * `--if-production` exists for the Vercel build command. Every deploy runs the build, including
 * previews, and previews currently share the production database, so an unguarded run would apply
 * a feature branch's migrations to production the moment someone opened a pull request.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const migrationsDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

// Any constant will do; it only has to be the same in every process that runs this script. Two
// deploys landing together then queue instead of both trying to create the same table.
const lockKey = 4021;

/**
 * Pins the ambiguous SSL modes to verify-full, and leaves an explicit one alone.
 *
 * Neon hands out strings ending in `sslmode=require`, which `pg` 9 will read as libpq does:
 * encrypt without verifying the certificate. That is the case worth defending against, because it
 * arrives by default and reverts on any `vercel env pull`. A string that names some other mode is
 * someone stating what they want, which is how the throwaway database in CI gets connected to at
 * all. src/lib/db.ts pins unconditionally instead, because the app only ever talks to Neon.
 */
function verifyingTls(connectionString) {
  const url = new URL(connectionString);
  const mode = url.searchParams.get("sslmode");
  if (!mode || mode === "require")
    url.searchParams.set("sslmode", "verify-full");
  return url.toString();
}

function checksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

function readMigrations() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => {
      const sql = readFileSync(join(migrationsDir, name), "utf8");
      return { name, sql, checksum: checksum(sql) };
    });
}

async function main() {
  if (
    process.argv.includes("--if-production") &&
    process.env.VERCEL_ENV !== "production"
  ) {
    console.log(
      `skipped: VERCEL_ENV is ${process.env.VERCEL_ENV ?? "unset"}, not production`,
    );
    return;
  }

  const connectionString = process.env.DATABASE_URL_UNPOOLED;
  if (!connectionString) throw new Error("DATABASE_URL_UNPOOLED is not set.");

  const client = new pg.Client({
    connectionString: verifyingTls(connectionString),
  });
  await client.connect();

  try {
    await client.query(`
      create table if not exists "_migration" (
        "name" text not null primary key,
        "checksum" text not null,
        "appliedAt" timestamptz default CURRENT_TIMESTAMP not null
      )
    `);

    await client.query("select pg_advisory_lock($1)", [lockKey]);

    const { rows } = await client.query(
      `select "name", "checksum" from "_migration"`,
    );
    const applied = new Map(rows.map((row) => [row.name, row.checksum]));

    let ran = 0;
    for (const migration of readMigrations()) {
      const seen = applied.get(migration.name);

      if (seen) {
        // A merged migration is immutable. Editing one means the database and the repo disagree
        // about what was applied, and every environment already past this point is now wrong.
        if (seen !== migration.checksum) {
          throw new Error(
            `${migration.name} changed after it was applied. Add a new migration instead of editing this one.`,
          );
        }
        continue;
      }

      // One transaction per file, so a migration either lands whole or not at all and the ledger
      // can never claim something ran halfway. A statement that cannot run inside a transaction,
      // such as create index concurrently, needs its own path and does not have one yet.
      await client.query("begin");
      try {
        await client.query(migration.sql);
        await client.query(
          `insert into "_migration" ("name", "checksum") values ($1, $2)`,
          [migration.name, migration.checksum],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw new Error(`${migration.name} failed: ${error.message}`, {
          cause: error,
        });
      }

      console.log(`applied ${migration.name}`);
      ran += 1;
    }

    console.log(ran === 0 ? "nothing to apply" : `applied ${ran} migration(s)`);
  } finally {
    // Released by disconnecting too, but only once the session actually ends, which on a failure
    // path can be later than it looks.
    await client
      .query("select pg_advisory_unlock($1)", [lockKey])
      .catch(() => {});
    await client.end();
  }
}

await main();
