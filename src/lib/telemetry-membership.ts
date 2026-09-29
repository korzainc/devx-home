import "server-only";
import { getAuth } from "./auth";
import { getPool } from "./db";
import { fetchOrgMembership } from "./org";
import { storeMembership, type StoredMembership } from "./membership";

// Telemetry has no browser session to trigger the portal's ordinary recheck.
export const TELEMETRY_MEMBERSHIP_MS = 5 * 60 * 1000;
export const TELEMETRY_MEMBERSHIP_TIMEOUT_MS = 10_000;
const pending = new Map<string, Promise<boolean>>();

export type TelemetryMembership = StoredMembership & { fresh: boolean };

// Use the database clock for both the optimistic read and the ingestion lock.
// Keep age separate from membership: expiry means recheck, not access denied.
export const TELEMETRY_MEMBERSHIP_SELECT = `SELECT "orgMember", "orgCheckedAt"::text AS "orgCheckedAt", COALESCE("orgCheckedAt">statement_timestamp()-interval '${TELEMETRY_MEMBERSHIP_MS} milliseconds' AND "orgCheckedAt"<=statement_timestamp(),false) AS fresh FROM "user" WHERE id=$1`;

async function providerMembership(userId: string): Promise<boolean> {
  let check = pending.get(userId);
  if (!check) {
    check = (async () => {
      const accounts = await getPool().query<{ id: string }>(
        'SELECT id FROM account WHERE "userId"=$1 AND "providerId"=\'github\'',
        [userId],
      );
      if (accounts.rows.length !== 1) return false;
      // Trusted server-side API: no incoming headers or browser identity. Better
      // Auth checks account ownership and manages token refresh and encryption.
      const { accessToken } = await getAuth().api.getAccessToken({
        body: { accountId: accounts.rows[0].id, userId },
      });
      return accessToken ? fetchOrgMembership(accessToken) : false;
    })().finally(() => pending.delete(userId));
    pending.set(userId, check);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Better Auth does not expose refresh cancellation. Keep its in-flight work
    // shared until it actually settles, but stop awaiting it after ten seconds.
    // No transaction or connection is retained across provider I/O and a timed-out request never writes
    // a membership verdict or usage. The provider API may finish its own refresh.
    return await Promise.race([
      check,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(Error("Membership provider unavailable")),
          TELEMETRY_MEMBERSHIP_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function telemetryMembership(userId: string): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query<TelemetryMembership>(
    TELEMETRY_MEMBERSHIP_SELECT,
    [userId],
  );
  const user = rows[0];
  if (!user?.orgMember) return false;
  if (user.fresh) return true;
  // Outages throw through to HTTP 503, so collectors retain their queue.
  if (!(await providerMembership(userId))) {
    await storeMembership(userId, false);
    return false;
  }
  // Keep PostgreSQL's full timestamp precision for this optimistic comparison;
  // node-pg Date decoding would discard microseconds and falsely reject refresh.
  // A concurrent removal must not be overwritten by an older positive check.
  const updated = await pool.query(
    'UPDATE "user" SET "orgCheckedAt"=now() WHERE id=$1 AND "orgMember"=true AND "orgCheckedAt" IS NOT DISTINCT FROM $2::timestamptz RETURNING id',
    [userId, user.orgCheckedAt ?? null],
  );
  if (updated.rows.length === 1) return true;
  // Another successful check can advance the cache while this one is in
  // flight. That is not a denial, and must not pause the collector.
  const current = await pool.query<TelemetryMembership>(
    TELEMETRY_MEMBERSHIP_SELECT,
    [userId],
  );
  if (!current.rows[0]?.orgMember) return false;
  if (!current.rows[0].fresh) throw Error("Membership cache needs rechecking");
  return true;
}
