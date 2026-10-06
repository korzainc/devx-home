// Opt-in real PostgreSQL evidence. Runs in a unique schema and refuses remote databases.
// getPool points production handlers at that real schema. The HTTP consent test substitutes
// only session/membership identity at the test boundary; real GitHub/browser acceptance is separate.
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";
import { localTelemetryTestDatabase } from "../test/telemetry-database";
import {
  issueCode,
  exchangeCode,
  pkceChallenge,
  tokenHash,
  consentToken,
  revokeCredentials,
  MembershipRequiredError,
  type TransactionPool,
} from "./telemetry-auth";
const db = vi.hoisted(() => ({ pool: null as unknown as pg.Pool }));
vi.mock("./db", () => ({ getPool: () => db.pool }));
const identity = vi.hoisted(() => ({
  member: true,
  token: "fixture-github-token" as string | null,
}));
vi.mock("./auth", () => ({
  getAuth: () => ({
    api: {
      getAccessToken: async () => ({ accessToken: identity.token }),
      getSession: async ({ headers }: { headers: Headers }) =>
        headers.get("cookie") === "fixture_session=authorized"
          ? {
              user: { id: "telemetry-test-user", orgMember: true },
              session: { id: "fixture-browser-session" },
            }
          : null,
    },
  }),
}));
vi.mock("./membership", async (original) => ({
  ...(await original<typeof import("./membership")>()),
  isOrgMember: async () => identity.member,
}));
import { devicesGet, devicesPost } from "./telemetry-http";
import { storeMembership } from "./membership";
vi.mock("./org", () => ({ fetchOrgMembership: async () => identity.member }));
import { recordAnalysisRun, readAnalysisUsage } from "./analysis-usage";
const configured = process.env.TEST_TELEMETRY_DATABASE_URL;
const run = promisify(execFile);
describe.skipIf(!configured)("telemetry with isolated PostgreSQL", () => {
  const schema = `telemetry_test_${randomUUID().replaceAll("-", "")}`;
  let admin: pg.Pool;
  let connection: string;
  let created = false;
  const verifier = "v".repeat(43);
  const params = {
    redirect_uri: "http://127.0.0.1:49152/callback",
    state: "s".repeat(43),
    code_challenge: pkceChallenge(verifier),
  };
  const payload = (code: string, changes = {}) => ({
    code,
    code_verifier: verifier,
    redirect_uri: params.redirect_uri,
    ...changes,
  });
  async function freshDevice() {
    return (await exchangeCode(
      db.pool,
      payload(await issueCode(db.pool, "telemetry-test-user", params)),
    ))!;
  }
  function pauseQuery(match: (sql: string) => boolean) {
    const source = db.pool;
    const reached = Promise.withResolvers<void>();
    const proceed = Promise.withResolvers<void>();
    const pool: TransactionPool = {
      connect: async () => {
        const client = await source.connect();
        return {
          query: async (sql, values) => {
            const result = await client.query(sql, values);
            if (match(sql)) {
              reached.resolve();
              await proceed.promise;
            }
            return result;
          },
          release: () => client.release(),
        };
      },
    };
    return { pool, reached: reached.promise, resume: proceed.resolve };
  }
  beforeAll(async () => {
    const url = localTelemetryTestDatabase(configured!);
    admin = new pg.Pool({ connectionString: url.toString() });
    await admin.query(`CREATE SCHEMA ${schema}`);
    created = true;
    url.searchParams.set("options", `-c search_path=${schema}`);
    connection = url.toString();
    db.pool = new pg.Pool({ connectionString: connection });
    await run(process.execPath, ["scripts/migrate.mjs"], {
      env: { ...process.env, DATABASE_URL_UNPOOLED: connection },
    });
    await db.pool.query(
      `INSERT INTO "user"(id,name,email,"emailVerified","orgMember","orgCheckedAt") VALUES('telemetry-test-user','test','test@example.invalid',false,true,now())`,
    );
    vi.stubEnv("TELEMETRY_ENABLED", "1");
    vi.stubEnv("KORZA_LOCAL_USAGE", "1");
    vi.stubEnv("DATABASE_URL", connection);
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "isolated-test-only-secret-not-a-real-session-key",
    );
  }, 20000);
  afterAll(async () => {
    vi.unstubAllEnvs();
    await db.pool?.end();
    if (admin) {
      try {
        if (created)
          await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      } finally {
        await admin.end();
      }
    }
  });
  it("records analysis submissions once per run and counts distinct repositories", async () => {
    expect(await readAnalysisUsage()).toEqual({ runs: 0, repositories: 0 });
    const first = randomUUID();
    await Promise.all([
      recordAnalysisRun(first, 42),
      recordAnalysisRun(first, 42),
    ]);
    expect(await readAnalysisUsage()).toEqual({ runs: 1, repositories: 1 });

    await recordAnalysisRun(first, 42);
    expect(await readAnalysisUsage()).toEqual({ runs: 1, repositories: 1 });
    await recordAnalysisRun(randomUUID(), 42);
    expect(await readAnalysisUsage()).toEqual({ runs: 2, repositories: 1 });
    await recordAnalysisRun(randomUUID(), 84);
    expect(await readAnalysisUsage()).toEqual({ runs: 3, repositories: 2 });

    await recordAnalysisRun("invalid-run", 42);
    await recordAnalysisRun(randomUUID(), undefined);
    await recordAnalysisRun(randomUUID(), -1);
    expect(await readAnalysisUsage()).toEqual({ runs: 3, repositories: 2 });
  });
  it("cleans at most 1000 expired grants per issuance and preserves live grants", async () => {
    const live = await issueCode(db.pool, "telemetry-test-user", params);
    await db.pool.query(
      "INSERT INTO telemetry_codes(code_hash,user_id,code_challenge,redirect_uri,expires_at) SELECT 'cleanup-'||n,'telemetry-test-user',$1,$2,now()-interval '1 day' FROM generate_series(1,1002) n",
      [params.code_challenge, params.redirect_uri],
    );
    await issueCode(db.pool, "telemetry-test-user", params);
    const expired = await db.pool.query(
      "SELECT count(*)::int total FROM telemetry_codes WHERE code_hash LIKE 'cleanup-%'",
    );
    expect(expired.rows[0].total).toBe(2);
    const retained = await db.pool.query(
      "SELECT code_hash FROM telemetry_codes WHERE code_hash=$1",
      [tokenHash(live)],
    );
    expect(retained.rows).toHaveLength(1);
    await db.pool.query(
      "DELETE FROM telemetry_codes WHERE code_hash LIKE 'cleanup-%'",
    );
  });
  it("revocation also cancels a renewal issued while it waits for the device lock", async () => {
    const first = await freshDevice();
    const paused = pauseQuery(
      (sql) => sql.startsWith("SELECT device_id") && sql.endsWith("FOR UPDATE"),
    );
    const issuance = issueCode(paused.pool, "telemetry-test-user", {
      ...params,
      device_id: first.device_id,
    });
    let revocation: Promise<boolean> | undefined;
    try {
      await paused.reached;
      const revoker = await db.pool.connect();
      const { rows } = await revoker.query("SELECT pg_backend_pid() AS pid");
      revocation = revokeCredentials(
        { connect: async () => revoker },
        { tokenHash: tokenHash(first.token) },
      );
      await expect
        .poll(
          async () => {
            const activity = await admin.query(
              "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",
              [rows[0].pid],
            );
            return activity.rows[0]?.wait_event_type;
          },
          { timeout: 1000, interval: 10 },
        )
        .toBe("Lock");
      // Issuance holds the device row until its code is stored. Revocation must observe that
      // newly committed code when it acquires the row, even if its first snapshot predates it.
      paused.resume();
      const code = await issuance;
      expect(await revocation).toBe(true);
      expect(await exchangeCode(db.pool, payload(code))).toBeNull();
    } finally {
      paused.resume();
      await Promise.allSettled([issuance, ...(revocation ? [revocation] : [])]);
    }
  });
  it("an exchange that already read a grant cannot revive a subsequently revoked device", async () => {
    const first = await freshDevice();
    const code = await issueCode(db.pool, "telemetry-test-user", {
      ...params,
      device_id: first.device_id,
    });
    const paused = pauseQuery((sql) =>
      sql.startsWith("SELECT user_id,device_id"),
    );
    const exchange = exchangeCode(paused.pool, payload(code));
    try {
      await paused.reached;
      expect(
        await revokeCredentials(db.pool, {
          deviceId: first.device_id,
          userId: "telemetry-test-user",
        }),
      ).toBe(true);
      paused.resume();
      expect(await exchange).toBeNull();
    } finally {
      paused.resume();
      await Promise.allSettled([exchange]);
    }
  });
  it("a failed revocation preserves both the device and outstanding consent atomically", async () => {
    const first = await freshDevice();
    const code = await issueCode(db.pool, "telemetry-test-user", {
      ...params,
      device_id: first.device_id,
    });
    const failingPool: TransactionPool = {
      connect: async () => {
        const client = await db.pool.connect();
        return {
          query: async (sql, values) => {
            if (sql.startsWith("DELETE FROM telemetry_codes"))
              throw Error("injected code invalidation failure");
            return client.query(sql, values);
          },
          release: () => client.release(),
        };
      },
    };
    await expect(
      revokeCredentials(failingPool, { tokenHash: tokenHash(first.token) }),
    ).rejects.toThrow("injected code invalidation failure");

    expect(
      (
        await db.pool.query(
          "SELECT revoked_at FROM telemetry_devices WHERE device_id=$1",
          [first.device_id],
        )
      ).rows[0].revoked_at,
    ).toBeNull();
    expect(await exchangeCode(db.pool, payload(code))).not.toBeNull();
  });
  it("another owner cannot revoke a device or invalidate its pending consent", async () => {
    const first = await freshDevice();
    const code = await issueCode(db.pool, "telemetry-test-user", {
      ...params,
      device_id: first.device_id,
    });
    expect(
      await revokeCredentials(db.pool, {
        deviceId: first.device_id,
        userId: "another-owner",
      }),
    ).toBe(false);

    expect(
      (
        await db.pool.query(
          "SELECT revoked_at FROM telemetry_devices WHERE device_id=$1",
          [first.device_id],
        )
      ).rows[0].revoked_at,
    ).toBeNull();
    expect(await exchangeCode(db.pool, payload(code))).not.toBeNull();
  });
  it("rejects stolen, wrong-PKCE, expired and replayed codes using real atomic SQL", async () => {
    const code = await issueCode(db.pool, "telemetry-test-user", params);
    expect(
      await exchangeCode(
        db.pool,
        payload(code, { code_verifier: "w".repeat(43) }),
      ),
    ).toBeNull();
    expect(
      await exchangeCode(
        db.pool,
        payload(code, { redirect_uri: "http://127.0.0.1:49200/callback" }),
      ),
    ).toBeNull();
    const attempts = await Promise.all([
      exchangeCode(db.pool, payload(code)),
      exchangeCode(db.pool, payload(code)),
    ]);
    expect(attempts.filter(Boolean)).toHaveLength(1);
    expect(await exchangeCode(db.pool, payload(code))).toBeNull();
    const expired = await issueCode(db.pool, "telemetry-test-user", params);
    await db.pool.query(
      "UPDATE telemetry_codes SET expires_at=now()-interval '1 second' WHERE code_hash=$1",
      [tokenHash(expired)],
    );
    expect(await exchangeCode(db.pool, payload(expired))).toBeNull();
    const credential = attempts.find(Boolean)!;
    const { rows } = await db.pool.query(
      "SELECT token_hash,expires_at FROM telemetry_devices WHERE device_id=$1",
      [credential.device_id],
    );
    expect(rows[0].token_hash).toBe(tokenHash(credential.token));
    expect(
      new Date(rows[0].expires_at).getTime() - Date.now(),
    ).toBeLessThanOrEqual(12 * 60 * 60 * 1000);
  });
  it("applies the new read indexes once and uses them for selective plugin and skill reads", async () => {
    const names = (
      await db.pool.query(
        "SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND indexname LIKE 'telemetry_%'",
      )
    ).rows.map((row) => row.indexname);
    for (const name of [
      "telemetry_events_plugin_kind_skill_idx",
      "telemetry_skill_metrics_skill_plugin_idx",
      "telemetry_events_device_idx",
      "telemetry_skill_metrics_device_idx",
      "telemetry_codes_device_idx",
      "telemetry_codes_user_idx",
    ])
      expect(names).toContain(name);
    await db.pool.query(
      "INSERT INTO telemetry_events(event_id,kind,occurred_at,plugin,skill) SELECT 'index-probe-'||n,'skill_activated',now(),'unrelated-plugin','unrelated-skill' FROM generate_series(1,20000) n",
    );
    await db.pool.query(
      "INSERT INTO telemetry_skill_metrics(stream_id,value,temporality,skill,plugin) SELECT 'index-probe-'||n,1,2,'unrelated-skill','unrelated-plugin' FROM generate_series(1,20000) n",
    );
    await db.pool.query("ANALYZE telemetry_events");
    await db.pool.query("ANALYZE telemetry_skill_metrics");
    for (const [sql, index] of [
      [
        "SELECT skill,count(*) FROM telemetry_events WHERE plugin='humanizer' AND kind='skill_activated' AND skill=ANY(ARRAY['humanizer']) GROUP BY skill",
        "telemetry_events_plugin_kind_skill_idx",
      ],
      [
        "SELECT client,source,count(*) FROM telemetry_events WHERE plugin='humanizer' AND kind='plugin_installed' GROUP BY client,source",
        "telemetry_events_plugin_kind_skill_idx",
      ],
      [
        "SELECT skill,sum(value) FROM telemetry_skill_metrics WHERE (plugin='superpowers' OR plugin IS NULL) AND skill=ANY(ARRAY['superpowers_brainstorming']) GROUP BY skill",
        "telemetry_skill_metrics_skill_plugin_idx",
      ],
    ])
      expect(
        JSON.stringify(
          (await db.pool.query(`EXPLAIN (FORMAT JSON) ${sql}`)).rows,
        ),
      ).toContain(index);
    const rerun = await run(process.execPath, ["scripts/migrate.mjs"], {
      env: { ...process.env, DATABASE_URL_UNPOOLED: connection },
    });
    expect(rerun.stdout.trim()).toBe("nothing to apply");
    expect(
      (
        await db.pool.query(
          "SELECT name FROM _migration WHERE name='0004_usage_monitoring.sql'",
        )
      ).rows,
    ).toHaveLength(1);
  });

  async function membershipOwner() {
    const user = `membership-${randomUUID()}`;
    await db.pool.query(
      'INSERT INTO "user"(id,name,email,"emailVerified","orgMember","orgCheckedAt") VALUES($1,$1,$2,false,true,now())',
      [user, `${user}@example.invalid`],
    );
    return user;
  }
  async function membershipDevice() {
    const user = await membershipOwner();
    const credential = (await exchangeCode(
      db.pool,
      payload(await issueCode(db.pool, user, params)),
    ))!;
    return { user, credential };
  }
  async function waitForBlockedQuery(sql: string) {
    await expect
      .poll(
        async () =>
          (
            await admin.query(
              "SELECT count(*)::int count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query=$1",
              [sql],
            )
          ).rows[0].count,
        { timeout: 1000, interval: 10 },
      )
      .toBe(1);
  }
  const memberLock =
    'SELECT id FROM "user" WHERE id=$1 AND "orgMember"=true FOR SHARE';
  const removalUpdate =
    'UPDATE "user" SET "orgMember"=$1,"orgCheckedAt"=now() WHERE id=$2';

  it("membership removal waits for renewal issuance, then deletes its newly committed grant", async () => {
    const { user, credential } = await membershipDevice();
    const paused = pauseQuery((sql) => sql === memberLock);
    const issuance = issueCode(paused.pool, user, {
      ...params,
      device_id: credential.device_id,
    });
    let removal: Promise<void> | undefined;
    try {
      await paused.reached;
      removal = storeMembership(user, false);
      await waitForBlockedQuery(removalUpdate);
      paused.resume();
      const code = await issuance;
      await removal;
      await storeMembership(user, true);
      expect(
        (
          await db.pool.query(
            "SELECT revoked_at FROM telemetry_devices WHERE device_id=$1",
            [credential.device_id],
          )
        ).rows[0].revoked_at,
      ).not.toBeNull();
      expect(await exchangeCode(db.pool, payload(code))).toBeNull();
    } finally {
      paused.resume();
      await Promise.allSettled([issuance, ...(removal ? [removal] : [])]);
    }
  });

  it("membership removal waits for exchange, then revokes the newly minted credential", async () => {
    const { user, credential } = await membershipDevice();
    const code = await issueCode(db.pool, user, {
      ...params,
      device_id: credential.device_id,
    });
    const paused = pauseQuery((sql) => sql === memberLock);
    const exchange = exchangeCode(paused.pool, payload(code));
    let removal: Promise<void> | undefined;
    try {
      await paused.reached;
      removal = storeMembership(user, false);
      await waitForBlockedQuery(removalUpdate);
      paused.resume();
      const fresh = (await exchange)!;
      expect(fresh.device_id).toBe(credential.device_id);
      await removal;
      await storeMembership(user, true);
      expect(
        (
          await db.pool.query(
            "SELECT revoked_at FROM telemetry_devices WHERE device_id=$1",
            [fresh.device_id],
          )
        ).rows[0].revoked_at,
      ).not.toBeNull();
    } finally {
      paused.resume();
      await Promise.allSettled([exchange, ...(removal ? [removal] : [])]);
    }
  });

  it.each(["issuance", "exchange"] as const)(
    "a removal that locks first rejects concurrent renewal %s",
    async (operation) => {
      const { user, credential } = await membershipDevice();
      const consent = { ...params, device_id: credential.device_id };
      const code = await issueCode(db.pool, user, consent);
      const original = db.pool;
      const paused = pauseQuery((sql) => sql === removalUpdate);
      db.pool = { connect: paused.pool.connect } as pg.Pool;
      const removal = storeMembership(user, false);
      let attempt: Promise<unknown> | undefined;
      try {
        await paused.reached;
        db.pool = original;
        attempt =
          operation === "issuance"
            ? expect(issueCode(original, user, consent)).rejects.toBeInstanceOf(
                MembershipRequiredError,
              )
            : expect(exchangeCode(original, payload(code))).resolves.toBeNull();
        await waitForBlockedQuery(memberLock);
        paused.resume();
        await Promise.all([removal, attempt]);
        expect(
          (
            await original.query(
              "SELECT code_hash FROM telemetry_codes WHERE user_id=$1",
              [user],
            )
          ).rows,
        ).toHaveLength(0);
      } finally {
        db.pool = original;
        paused.resume();
        await Promise.allSettled([removal, ...(attempt ? [attempt] : [])]);
      }
    },
  );

  it.each(["initial", "renewal"] as const)(
    "an exchange that read %s consent before removal cannot reuse it after rejoin",
    async (kind) => {
      const { user, credential } = await membershipDevice();
      const code = await issueCode(
        db.pool,
        user,
        kind === "renewal"
          ? { ...params, device_id: credential.device_id }
          : params,
      );
      const paused = pauseQuery((sql) =>
        sql.startsWith("SELECT user_id,device_id"),
      );
      const exchange = exchangeCode(paused.pool, payload(code));
      try {
        await paused.reached;
        await storeMembership(user, false);
        await storeMembership(user, true);
        paused.resume();
        expect(await exchange).toBeNull();
        expect(
          (
            await db.pool.query(
              "SELECT device_id FROM telemetry_devices WHERE user_id=$1 AND revoked_at IS NULL",
              [user],
            )
          ).rows,
        ).toHaveLength(0);
      } finally {
        paused.resume();
        await Promise.allSettled([exchange]);
      }
    },
  );

  it("rolls back the membership verdict and device revocation if canceling grants fails", async () => {
    const { user, credential } = await membershipDevice();
    const code = await issueCode(db.pool, user, params);
    const original = db.pool;
    db.pool = {
      connect: async () => {
        const client = await original.connect();
        return {
          query: (sql: string, values?: unknown[]) =>
            sql.startsWith("DELETE FROM telemetry_codes")
              ? client.query("SELECT missing_membership_rollback_column")
              : client.query(sql, values),
          release: () => client.release(),
        };
      },
    } as pg.Pool;
    try {
      await expect(storeMembership(user, false)).rejects.toThrow(
        "missing_membership_rollback_column",
      );
    } finally {
      db.pool = original;
    }

    expect(
      (
        await original.query(
          "SELECT revoked_at FROM telemetry_devices WHERE device_id=$1",
          [credential.device_id],
        )
      ).rows[0].revoked_at,
    ).toBeNull();
    expect(await exchangeCode(original, payload(code))).not.toBeNull();
  });

  it("recovers from an expired revoke form only after a fresh form submission", async () => {
    const credential = await freshDevice();
    const form = (csrf: string) =>
      new Request("http://localhost/telemetry/devices", {
        method: "POST",
        headers: {
          origin: "http://localhost",
          cookie: "fixture_session=authorized",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ device_id: credential.device_id, csrf }),
      });
    const expired = consentToken(
      {
        redirect_uri: "revoke",
        state: credential.device_id,
        code_challenge: "",
      },
      "fixture-browser-session",
      process.env.BETTER_AUTH_SECRET!,
      Date.now() - 600001,
    );
    const rejected = await devicesPost(form(expired));
    expect(rejected.status).toBe(403);
    expect(await rejected.text()).toContain('href="/telemetry/devices"');
    expect(
      (
        await db.pool.query(
          "SELECT revoked_at FROM telemetry_devices WHERE device_id=$1",
          [credential.device_id],
        )
      ).rows[0].revoked_at,
    ).toBeNull();
    const page = await devicesGet(
      new Request("http://localhost/telemetry/devices", {
        headers: { cookie: "fixture_session=authorized" },
      }),
    );
    const csrf = new RegExp(
      `name="device_id" value="${credential.device_id}"><input type="hidden" name="csrf" value="([^"]+)"`,
    ).exec(await page.text())?.[1];
    expect(csrf).toBeDefined();
    expect((await devicesPost(form(csrf!))).status).toBe(303);
    expect(
      (
        await db.pool.query(
          "SELECT revoked_at FROM telemetry_devices WHERE device_id=$1",
          [credential.device_id],
        )
      ).rows[0].revoked_at,
    ).not.toBeNull();
  });
});
