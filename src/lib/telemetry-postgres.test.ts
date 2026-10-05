// Opt-in real PostgreSQL evidence. Runs in a unique schema and refuses remote databases.
// getPool points production handlers at that real schema. The HTTP consent test substitutes
// only session/membership identity at the test boundary; real GitHub/browser acceptance is separate.
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";
import { createServer } from "node:http";
import { Readable } from "node:stream";
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
import {
  GET as connectGET,
  POST as connectPOST,
} from "../app/telemetry/connect/route";
import { POST as exchangePOST } from "../app/api/telemetry/exchange/route";
import { POST as eventsPOST } from "../app/api/telemetry/events/route";
import { POST as revokePOST } from "../app/api/telemetry/revoke/route";
import {
  receiveEvents,
  revokeDevice,
  devicesGet,
  devicesPost,
} from "./telemetry-http";
import { storeMembership } from "./membership";
vi.mock("./org", () => ({ fetchOrgMembership: async () => identity.member }));
import { telemetryMembership } from "./telemetry-membership";
import { readPluginInstalls, readSkillUsage } from "./skill-usage";
import { filterMetrics } from "./telemetry-metrics";
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
  const eventRequest = (token: string) =>
    new Request("http://localhost/api/telemetry/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ events: [], metrics: [] }),
    });
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
  it("renews the owned device, invalidates its old token and preserves cumulative deduplication", async () => {
    const first = (await exchangeCode(
      db.pool,
      payload(await issueCode(db.pool, "telemetry-test-user", params)),
    ))!;
    const packet = {
      events: [],
      metrics: [
        {
          id: "d".repeat(64),
          value: 7,
          temporality: 2,
          plugin: "codezen",
          skill: "brainstorm",
          invokeType: null,
        },
      ],
    };
    const request = (token: string) =>
      new Request("http://localhost/api/telemetry/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(packet),
      });
    expect((await receiveEvents(request(first.token))).status).toBe(200);
    const code = await issueCode(db.pool, "telemetry-test-user", {
      ...params,
      device_id: first.device_id,
    });
    const renewed = (await exchangeCode(db.pool, payload(code)))!;
    expect(renewed.device_id).toBe(first.device_id);
    expect(renewed.token).not.toBe(first.token);
    expect((await receiveEvents(request(first.token))).status).toBe(401);
    expect((await receiveEvents(request(renewed.token))).status).toBe(200);
    const { rows } = await db.pool.query(
      "SELECT sum(value)::int total FROM telemetry_skill_metrics WHERE device_id=$1",
      [first.device_id],
    );
    expect(rows[0].total).toBe(7);
    await db.pool.query(
      `INSERT INTO "user"(id,name,email,"emailVerified","orgMember") VALUES('different-user','test','other@example.invalid',false,true)`,
    );
    await expect(
      issueCode(db.pool, "different-user", {
        ...params,
        device_id: first.device_id,
      }),
    ).rejects.toThrow("Device does not belong to this user");
    // A revoked device may be explicitly authorized again by the same owner.
    expect((await revokeDevice(request(renewed.token))).status).toBe(204);
    const restored = (await exchangeCode(
      db.pool,
      payload(
        await issueCode(db.pool, "telemetry-test-user", {
          ...params,
          device_id: first.device_id,
        }),
      ),
    ))!;
    expect(restored.device_id).toBe(first.device_id);
    expect((await receiveEvents(request(restored.token))).status).toBe(200);
    await db.pool.query(
      "DELETE FROM telemetry_skill_metrics WHERE device_id=$1",
      [first.device_id],
    );
  });
  it.each(["bearer", "browser"])(
    "%s revocation invalidates outstanding renewal codes but permits fresh consent",
    async (route) => {
      const first = (await exchangeCode(
        db.pool,
        payload(await issueCode(db.pool, "telemetry-test-user", params)),
      ))!;
      const renewal = { ...params, device_id: first.device_id };
      const stale = await Promise.all([
        issueCode(db.pool, "telemetry-test-user", renewal),
        issueCode(db.pool, "telemetry-test-user", renewal),
      ]);
      if (route === "bearer") {
        expect((await revokeDevice(eventRequest(first.token))).status).toBe(
          204,
        );
      } else {
        const csrf = consentToken(
          {
            redirect_uri: "revoke",
            state: first.device_id,
            code_challenge: "",
          },
          "fixture-browser-session",
          process.env.BETTER_AUTH_SECRET!,
        );
        expect(
          (
            await devicesPost(
              new Request("http://localhost/telemetry/devices", {
                method: "POST",
                headers: {
                  origin: "http://localhost",
                  cookie: "fixture_session=authorized",
                },
                body: new URLSearchParams({ device_id: first.device_id, csrf }),
              }),
            )
          ).status,
        ).toBe(303);
      }
      for (const code of stale)
        expect(await exchangeCode(db.pool, payload(code))).toBeNull();
      expect((await receiveEvents(eventRequest(first.token))).status).toBe(401);
      const revoked = await db.pool.query(
        "SELECT revoked_at FROM telemetry_devices WHERE device_id=$1",
        [first.device_id],
      );
      expect(revoked.rows[0].revoked_at).not.toBeNull();
      const restored = (await exchangeCode(
        db.pool,
        payload(await issueCode(db.pool, "telemetry-test-user", renewal)),
      ))!;
      expect(restored.device_id).toBe(first.device_id);
      expect((await receiveEvents(eventRequest(restored.token))).status).toBe(
        200,
      );
      expect((await receiveEvents(eventRequest(first.token))).status).toBe(401);
    },
  );
  it("revocation also cancels a renewal issued while it waits for the device lock", async () => {
    const first = (await exchangeCode(
      db.pool,
      payload(await issueCode(db.pool, "telemetry-test-user", params)),
    ))!;
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
      expect((await receiveEvents(eventRequest(first.token))).status).toBe(401);
    } finally {
      paused.resume();
      await Promise.allSettled([issuance, ...(revocation ? [revocation] : [])]);
    }
  });
  it("an exchange that already read a grant cannot revive a subsequently revoked device", async () => {
    const first = (await exchangeCode(
      db.pool,
      payload(await issueCode(db.pool, "telemetry-test-user", params)),
    ))!;
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
      expect((await receiveEvents(eventRequest(first.token))).status).toBe(401);
    } finally {
      paused.resume();
      await Promise.allSettled([exchange]);
    }
  });
  it("a failed revocation preserves both the device and outstanding consent atomically", async () => {
    const first = (await exchangeCode(
      db.pool,
      payload(await issueCode(db.pool, "telemetry-test-user", params)),
    ))!;
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
    expect((await receiveEvents(eventRequest(first.token))).status).toBe(200);
    expect(await exchangeCode(db.pool, payload(code))).not.toBeNull();
  });
  it("another owner cannot revoke a device or invalidate its pending consent", async () => {
    const first = (await exchangeCode(
      db.pool,
      payload(await issueCode(db.pool, "telemetry-test-user", params)),
    ))!;
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
    expect((await receiveEvents(eventRequest(first.token))).status).toBe(200);
    expect(await exchangeCode(db.pool, payload(code))).not.toBeNull();
  });
  it("migration runner safely skips an already applied 0006", async () => {
    const result = await run(process.execPath, ["scripts/migrate.mjs"], {
      env: { ...process.env, DATABASE_URL_UNPOOLED: connection },
    });
    expect(result.stdout.trim()).toBe("nothing to apply");
    const { rows } = await db.pool.query(
      "SELECT name FROM _migration WHERE name='0006_telemetry_credentials.sql'",
    );
    expect(rows).toHaveLength(1);
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
  it("deduplicates retries and separates devices; revocation and expiry immediately reject ingest", async () => {
    const first = (await exchangeCode(
      db.pool,
      payload(await issueCode(db.pool, "telemetry-test-user", params)),
    ))!;
    const second = (await exchangeCode(
      db.pool,
      payload(await issueCode(db.pool, "telemetry-test-user", params)),
    ))!;
    const body = {
      events: [
        {
          id: "a".repeat(64),
          kind: "plugin_installed",
          client: "codex",
          source: "korza_cli",
          occurredAt: "2026-09-23T01:02:03.123456789Z",
          plugin: "codezen",
          skill: null,
        },
      ],
      metrics: [
        {
          id: "b".repeat(64),
          value: 3,
          temporality: 2,
          plugin: "codezen",
          skill: "brainstorm",
          invokeType: "explicit",
        },
      ],
    };
    const request = (token: string) =>
      new Request("http://localhost/api/telemetry/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
    for (const token of [first.token, first.token, second.token])
      expect((await receiveEvents(request(token))).status).toBe(200);
    const events = await db.pool.query(
      "SELECT device_id,client,source FROM telemetry_events",
    );
    expect(events.rows).toHaveLength(2);
    expect(new Set(events.rows.map((r) => r.device_id)).size).toBe(2);
    const metrics = await db.pool.query(
      "SELECT sum(value)::int total FROM telemetry_skill_metrics",
    );
    expect(metrics.rows[0].total).toBe(6);
    expect((await revokeDevice(request(first.token))).status).toBe(204);
    expect((await receiveEvents(request(first.token))).status).toBe(401);
    expect((await revokeDevice(request(first.token))).status).toBe(204);
    await db.pool.query(
      "UPDATE telemetry_devices SET expires_at=now()-interval '1 second' WHERE device_id=$1",
      [second.device_id],
    );
    expect((await receiveEvents(request(second.token))).status).toBe(401);
    expect((await revokeDevice(request(second.token))).status).toBe(204);
  });
  it("serves consent, code exchange, normalized ingestion and revocation over real HTTP", async () => {
    vi.stubEnv(
      "BETTER_AUTH_SECRET",
      "isolated-test-only-secret-not-a-real-session-key",
    );
    const routes: Record<string, (request: Request) => Promise<Response>> = {
      "GET /telemetry/connect": connectGET,
      "POST /telemetry/connect": connectPOST,
      "POST /api/telemetry/exchange": exchangePOST,
      "POST /api/telemetry/events": eventsPOST,
      "POST /api/telemetry/revoke": revokePOST,
    };
    const server = createServer(async (incoming, outgoing) => {
      try {
        const url = new URL(incoming.url!, `http://${incoming.headers.host}`);
        const handler = routes[`${incoming.method} ${url.pathname}`];
        if (!handler) {
          outgoing.writeHead(404).end();
          return;
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers))
          if (value !== undefined)
            headers.set(name, Array.isArray(value) ? value.join(",") : value);
        const init: RequestInit & { duplex: "half" } = {
          method: incoming.method,
          headers,
          duplex: "half",
        };
        if (incoming.method !== "GET" && incoming.method !== "HEAD")
          init.body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
        const response = await handler(new Request(url, init));
        outgoing.writeHead(
          response.status,
          Object.fromEntries(response.headers),
        );
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        outgoing.writeHead(500).end();
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw Error("No local server address");
    const origin = `http://127.0.0.1:${address.port}`;
    const browserHeaders = { cookie: "fixture_session=authorized" };
    const connectUrl =
      origin +
      "/telemetry/connect?" +
      new URLSearchParams({ ...params, code_challenge_method: "S256" });
    try {
      expect((await fetch(connectUrl)).status).toBe(401);
      const page = await fetch(connectUrl, { headers: browserHeaders });
      expect(page.status).toBe(200);
      const markup = await page.text();
      const csrf = /name="csrf" value="([^"]+)"/.exec(markup)![1];
      const consent = (
        changes: Record<string, string> = {},
        originHeader = origin,
      ) =>
        fetch(origin + "/telemetry/connect", {
          method: "POST",
          redirect: "manual",
          headers: { ...browserHeaders, origin: originHeader },
          body: new URLSearchParams({
            ...params,
            csrf,
            decision: "allow",
            ...changes,
          }),
        });
      expect((await consent({}, "https://attacker.invalid")).status).toBe(403);
      expect((await consent({ csrf: "bad" })).status).toBe(403);
      identity.member = false;
      const refused = await consent();
      expect(refused.status).toBe(303);
      const refusal = new URL(refused.headers.get("location")!);
      expect(refusal.searchParams.get("error")).toBe("access_denied");
      expect(refusal.searchParams.get("state")).toBe(params.state);
      expect(refusal.searchParams.has("code")).toBe(false);
      identity.member = true;
      const denial = await consent({ decision: "deny" });
      expect(denial.status).toBe(303);
      expect(
        new URL(denial.headers.get("location")!).searchParams.get("error"),
      ).toBe("access_denied");
      const allowed = await consent();
      expect(allowed.status).toBe(303);
      const callback = new URL(allowed.headers.get("location")!);
      expect(callback.searchParams.get("state")).toBe(params.state);
      expect(callback.searchParams.has("token")).toBe(false);
      const code = callback.searchParams.get("code")!;
      const exchange = (body: unknown) =>
        fetch(origin + "/api/telemetry/exchange", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      expect(
        (await exchange(payload(code, { code_verifier: "w".repeat(43) })))
          .status,
      ).toBe(400);
      const exchanged = await exchange(payload(code));
      expect(exchanged.status).toBe(200);
      expect(exchanged.headers.get("cache-control")).toBe("no-store");
      const credential = await exchanged.json();
      expect((await exchange(payload(code))).status).toBe(400);
      const body = {
        events: [
          {
            id: "c".repeat(64),
            kind: "plugin_installed",
            client: "codex",
            source: "korza_cli",
            occurredAt: "2026-09-23T01:02:03Z",
            plugin: "superpowers",
            skill: null,
          },
        ],
        metrics: [],
      };
      const send = (packet: unknown) =>
        fetch(origin + "/api/telemetry/events", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${credential.token}`,
          },
          body: JSON.stringify(packet),
        });
      expect((await send({ ...body, prompt: "must not store" })).status).toBe(
        400,
      );
      expect(
        (await send({ events: [], metrics: [], junk: "x".repeat(262144) }))
          .status,
      ).toBe(413);
      expect(
        (await send({ events: Array(1001).fill(body.events[0]), metrics: [] }))
          .status,
      ).toBe(400);
      expect((await send(body)).status).toBe(200);
      expect((await send(body)).status).toBe(200);
      const { rows } = await db.pool.query(
        "SELECT count(*)::int total FROM telemetry_events WHERE device_id=$1",
        [credential.device_id],
      );
      expect(rows[0].total).toBe(1);
      expect(
        (
          await fetch(origin + "/api/telemetry/revoke", {
            method: "POST",
            headers: { authorization: `Bearer ${credential.token}` },
          })
        ).status,
      ).toBe(204);
      expect((await send(body)).status).toBe(401);
    } finally {
      identity.member = true;
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
  it("does not attribute another plugin's metrics to a matching skill prefix", async () => {
    await db.pool.query(
      "INSERT INTO telemetry_skill_metrics(stream_id,value,temporality,skill,plugin) VALUES ('plugin-match',2,2,'superpowers_brainstorming','superpowers'),('plugin-mismatch',99,2,'superpowers_brainstorming','codezen'),('legacy-match',3,2,'superpowers_brainstorming',NULL),('legacy-other',97,2,'codezen_brainstorming',NULL),('legacy-unscoped',89,2,'brainstorming',NULL)",
    );
    expect(await readSkillUsage("superpowers", ["brainstorming"])).toEqual({
      brainstorming: { codex: 5 },
    });
    expect(await readSkillUsage("codezen", ["brainstorming"])).toEqual({
      brainstorming: { codex: 97 },
    });
  });
  it("stores replay-safe Claude installs without combining reporting sources", async () => {
    const credential = (await exchangeCode(
      db.pool,
      payload(await issueCode(db.pool, "telemetry-test-user", params)),
    ))!;
    const before = await readPluginInstalls("mattpocock-skills");
    const events = ["native_otel", "korza_cli"].map((source, index) => ({
      id: (index ? "c" : "e").repeat(64),
      kind: "plugin_installed",
      client: "claude",
      source,
      occurredAt: "2026-09-25T00:00:00Z",
      plugin: "mattpocock-skills",
      skill: null,
    }));
    const send = () =>
      receiveEvents(
        new Request("http://localhost/api/telemetry/events", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${credential.token}`,
          },
          body: JSON.stringify({ events, metrics: [] }),
        }),
      );
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    expect(await readPluginInstalls("mattpocock-skills")).toEqual({
      ...before,
      claudeNative: Number(before.claudeNative ?? 0) + 1,
      claudeKorza: Number(before.claudeKorza ?? 0) + 1,
    });
    const stored = await db.pool.query(
      "SELECT source, count(*)::int count FROM telemetry_events WHERE device_id=$1 GROUP BY source ORDER BY source",
      [credential.device_id],
    );
    expect(stored.rows).toEqual([
      { source: "korza_cli", count: 1 },
      { source: "native_otel", count: 1 },
    ]);
  });
  it("retains exact totals above the safe integer range after valid metric ingestion", async () => {
    const credential = (await exchangeCode(
      db.pool,
      payload(await issueCode(db.pool, "telemetry-test-user", params)),
    ))!;
    const metrics = [Number.MAX_SAFE_INTEGER, 1, 1].map((value, index) => ({
      id: String(index + 1).repeat(64),
      value,
      temporality: 2,
      plugin: "superpowers",
      skill: "superpowers_exact-total",
      invokeType: null,
    }));
    const response = await receiveEvents(
      new Request("http://localhost/api/telemetry/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${credential.token}`,
        },
        body: JSON.stringify({ events: [], metrics }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await readSkillUsage("superpowers", ["exact-total"])).toEqual({
      "exact-total": { codex: "9007199254740993" },
    });
  });
  it("records successful skill loads without failed injections or replay duplicates", async () => {
    const credential = (await exchangeCode(
      db.pool,
      payload(await issueCode(db.pool, "telemetry-test-user", params)),
    ))!;
    const body = {
      resourceMetrics: [
        {
          scopeMetrics: [
            {
              metrics: [
                {
                  name: "codex.skill.injected",
                  sum: {
                    aggregationTemporality: 2,
                    isMonotonic: true,
                    dataPoints: ["ok", "error"].map((status) => ({
                      asInt: status === "ok" ? "1" : "100",
                      startTimeUnixNano: "1",
                      timeUnixNano: "2",
                      attributes: Object.entries({
                        status,
                        plugin_id: "codezen_korza-marketplace",
                        skill: "codezen_status-filter",
                        invoke_type: "explicit",
                      }).map(([key, stringValue]) => ({
                        key,
                        value: { stringValue },
                      })),
                    })),
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const metrics = filterMetrics(body, credential.device_id);
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await receiveEvents(
        new Request("http://localhost/api/telemetry/events", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${credential.token}`,
          },
          body: JSON.stringify({ events: [], metrics }),
        }),
      );
      expect(response.status).toBe(200);
    }
    expect(await readSkillUsage("codezen", ["status-filter"])).toEqual({
      "status-filter": { codex: 1 },
    });
    const { rows } = await db.pool.query(
      "SELECT count(*)::int count,sum(value)::int total FROM telemetry_skill_metrics WHERE device_id=$1",
      [credential.device_id],
    );
    expect(rows).toEqual([{ count: 1, total: 1 }]);
  });
  it("accepts a maximum-size metric batch and deduplicates its retry", async () => {
    const credential = (await exchangeCode(
      db.pool,
      payload(await issueCode(db.pool, "telemetry-test-user", params)),
    ))!;
    const body = JSON.stringify({
      events: [],
      metrics: Array.from({ length: 1000 }, (_, index) => ({
        id: index.toString(16).padStart(64, "0"),
        value: 1,
        temporality: 2,
        plugin: "codezen",
        skill: "codezen_brainstorm",
        invokeType: null,
      })),
    });
    expect(Buffer.byteLength(body)).toBeLessThanOrEqual(256 * 1024);
    for (let attempt = 0; attempt < 2; attempt++)
      expect(
        (
          await receiveEvents(
            new Request("http://localhost/api/telemetry/events", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${credential.token}`,
              },
              body,
            }),
          )
        ).status,
      ).toBe(200);
    const { rows } = await db.pool.query(
      "SELECT count(*)::int count,sum(value)::int total FROM telemetry_skill_metrics WHERE device_id=$1",
      [credential.device_id],
    );
    expect(rows).toEqual([{ count: 1000, total: 1000 }]);
  });
  it("bulk ingestion preserves first metadata and greatest duplicate counter values", async () => {
    const credential = (await exchangeCode(
      db.pool,
      payload(await issueCode(db.pool, "telemetry-test-user", params)),
    ))!;
    const event = {
      id: "a".repeat(64),
      kind: "plugin_installed",
      client: "codex",
      source: "korza_cli",
      occurredAt: "2026-09-23T00:00:00Z",
      plugin: "codezen",
      skill: null,
    };
    const metric = {
      id: "b".repeat(64),
      value: 2,
      temporality: 2,
      plugin: "codezen",
      skill: "codezen_brainstorm",
      invokeType: "explicit",
    };
    const send = (body: unknown) =>
      receiveEvents(
        new Request("http://localhost/api/telemetry/events", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${credential.token}`,
          },
          body: JSON.stringify(body),
        }),
      );
    expect(
      (
        await send({
          events: [event, { ...event, plugin: "superpowers" }],
          metrics: [
            metric,
            { ...metric, value: 8, plugin: "superpowers", skill: null },
            { ...metric, value: 3 },
          ],
        })
      ).status,
    ).toBe(200);
    const storedEvent = await db.pool.query(
      "SELECT plugin FROM telemetry_events WHERE device_id=$1",
      [credential.device_id],
    );
    expect(storedEvent.rows).toEqual([{ plugin: "codezen" }]);
    const readMetric = () =>
      db.pool.query(
        "SELECT value::int value,temporality,plugin,skill,invoke_type FROM telemetry_skill_metrics WHERE device_id=$1",
        [credential.device_id],
      );
    const retained = {
      value: 8,
      temporality: 2,
      plugin: "codezen",
      skill: "codezen_brainstorm",
      invoke_type: "explicit",
    };
    expect((await readMetric()).rows).toEqual([retained]);
    expect(
      (
        await send({
          events: [],
          metrics: [
            { ...metric, value: 10, temporality: 1, skill: null },
            { ...metric, value: 9, plugin: "superpowers" },
          ],
        })
      ).status,
    ).toBe(200);
    expect((await readMetric()).rows).toEqual([{ ...retained, value: 10 }]);
  });
  it("rolls back the event bulk insert when the metric bulk insert fails", async () => {
    const credential = (await exchangeCode(
      db.pool,
      payload(await issueCode(db.pool, "telemetry-test-user", params)),
    ))!;
    await db.pool.query(
      "ALTER TABLE telemetry_skill_metrics ADD CONSTRAINT telemetry_batch_failure CHECK(value <> 8888)",
    );
    try {
      const response = await receiveEvents(
        new Request("http://localhost/api/telemetry/events", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${credential.token}`,
          },
          body: JSON.stringify({
            events: [
              {
                id: "c".repeat(64),
                kind: "plugin_installed",
                client: "codex",
                source: "korza_cli",
                occurredAt: "2026-09-23T00:00:00Z",
                plugin: "codezen",
                skill: null,
              },
            ],
            metrics: [
              {
                id: "d".repeat(64),
                value: 8888,
                temporality: 2,
                plugin: "codezen",
                skill: null,
                invokeType: null,
              },
            ],
          }),
        }),
      );
      expect(response.status).toBe(503);
      for (const table of ["telemetry_events", "telemetry_skill_metrics"])
        expect(
          (
            await db.pool.query(
              `SELECT count(*)::int count FROM ${table} WHERE device_id=$1`,
              [credential.device_id],
            )
          ).rows,
        ).toEqual([{ count: 0 }]);
    } finally {
      await db.pool.query(
        "ALTER TABLE telemetry_skill_metrics DROP CONSTRAINT telemetry_batch_failure",
      );
    }
  });
  it("paginates tied device history to an older renewed device and revokes it without crossing owners", async () => {
    const first = (await exchangeCode(
      db.pool,
      payload(await issueCode(db.pool, "telemetry-test-user", params)),
    ))!;
    const createdBefore = await db.pool.query(
      "SELECT created_at::text FROM telemetry_devices WHERE device_id=$1",
      [first.device_id],
    );
    const newer: string[] = Array.from({ length: 100 }, () => randomUUID());
    // now() gives every newer row the same timestamp, exercising the UUID tie-breaker.
    await db.pool.query(
      "INSERT INTO telemetry_devices(device_id,user_id,token_hash,created_at,expires_at) SELECT device_id,$3,token_hash,now(),now()-interval '1 hour' FROM unnest($1::uuid[],$2::text[]) AS fixture(device_id,token_hash)",
      [newer, newer.map((id) => tokenHash(id)), "telemetry-test-user"],
    );
    const renewed = (await exchangeCode(
      db.pool,
      payload(
        await issueCode(db.pool, "telemetry-test-user", {
          ...params,
          device_id: first.device_id,
        }),
      ),
    ))!;
    expect(renewed.device_id).toBe(first.device_id);
    expect(
      (
        await db.pool.query(
          "SELECT created_at::text FROM telemetry_devices WHERE device_id=$1",
          [first.device_id],
        )
      ).rows,
    ).toEqual(createdBefore.rows);
    expect((await receiveEvents(eventRequest(renewed.token))).status).toBe(200);

    const otherOwner = `pagination-other-${randomUUID()}`;
    await db.pool.query(
      'INSERT INTO "user"(id,name,email,"emailVerified","orgMember","orgCheckedAt") VALUES($1,$1,$2,false,true,now())',
      [otherOwner, `${otherOwner}@example.invalid`],
    );
    const other = (await exchangeCode(
      db.pool,
      payload(await issueCode(db.pool, otherOwner, params)),
    ))!;
    const origin = "http://localhost";
    const cookie = "fixture_session=authorized";
    const get = (path = "/telemetry/devices") =>
      devicesGet(new Request(origin + path, { headers: { cookie } }));
    const listed = (body: string) =>
      [...body.matchAll(/<li><code>([^<]+)<\/code>/g)].map((match) => match[1]);
    const newestPage = await get();
    expect(newestPage.status).toBe(200);
    const newestBody = await newestPage.text();
    expect(listed(newestBody)).toEqual([...newer].sort().reverse());
    expect(newestBody).not.toContain(first.device_id);
    expect(newestBody).not.toContain(other.device_id);
    const olderPath = /href="([^"]+)">Older devices<\/a>/.exec(newestBody)?.[1];
    expect(olderPath).toBeDefined();
    const olderPage = await get(olderPath!);
    expect(olderPage.status).toBe(200);
    const olderBody = await olderPage.text();
    expect(listed(olderBody)).toContain(first.device_id);
    expect(listed(olderBody).some((id) => newer.includes(id))).toBe(false);
    expect(olderBody).not.toContain(other.device_id);
    expect(olderBody).toContain("Newest devices");
    const csrf = new RegExp(
      `name="device_id" value="${first.device_id}"><input type="hidden" name="csrf" value="([^"]+)"`,
    ).exec(olderBody)?.[1];
    expect(csrf).toBeDefined();

    // A valid UUID from another owner must not become a cursor into this owner's rows.
    const foreignCursorPage = await get(
      `/telemetry/devices?before=${other.device_id}`,
    );
    expect(foreignCursorPage.status).toBe(200);
    expect(listed(await foreignCursorPage.text())).toEqual([]);

    const revoke = (device: string, csrf: string) =>
      devicesPost(
        new Request(origin + "/telemetry/devices", {
          method: "POST",
          headers: { origin, cookie },
          body: new URLSearchParams({ device_id: device, csrf }),
        }),
      );
    // Even a correctly signed fixture token cannot replace the owner predicate.
    const foreignCsrf = consentToken(
      { redirect_uri: "revoke", state: other.device_id, code_challenge: "" },
      "fixture-browser-session",
      process.env.BETTER_AUTH_SECRET!,
    );
    expect((await revoke(other.device_id, foreignCsrf)).status).toBe(303);
    expect((await receiveEvents(eventRequest(other.token))).status).toBe(200);

    const revoked = await revoke(first.device_id, csrf!);
    expect(revoked.status).toBe(303);
    expect(revoked.headers.get("location")).toBe("/telemetry/devices");
    expect((await receiveEvents(eventRequest(renewed.token))).status).toBe(401);
    const device = await db.pool.query(
      "SELECT revoked_at FROM telemetry_devices WHERE device_id=$1",
      [first.device_id],
    );
    expect(device.rows[0].revoked_at).not.toBeNull();
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
          "SELECT name FROM _migration WHERE name='0007_telemetry_read_indexes.sql'",
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
  const membershipPacket = (token: string) =>
    new Request("http://localhost/api/telemetry/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        events: [
          {
            id: "f".repeat(64),
            kind: "plugin_installed",
            occurredAt: "2026-09-28T00:00:00Z",
            plugin: "humanizer",
            skill: null,
            client: "claude",
            source: "korza_cli",
          },
        ],
        metrics: [],
      }),
    });

  it.each([
    { reason: "missing account", accounts: 0, token: "fixture-github-token" },
    {
      reason: "ambiguous accounts",
      accounts: 2,
      token: "fixture-github-token",
    },
    { reason: "null token", accounts: 1, token: null },
    { reason: "empty token", accounts: 1, token: "" },
  ])(
    "returns retryable 503 for $reason without revoking credentials or grants",
    async ({ accounts, token }) => {
      const { user, credential } = await membershipDevice();
      const code = await issueCode(db.pool, user, params);
      for (let index = 0; index < accounts; index++)
        await db.pool.query(
          `INSERT INTO account(id,issuer,"accountId","providerId","userId","updatedAt") VALUES($1,'https://github.com',$1,'github',$2,now())`,
          [`${user}-${index}`, user],
        );
      await db.pool.query(
        'UPDATE "user" SET "orgCheckedAt"=now()-interval \'6 minutes\' WHERE id=$1',
        [user],
      );
      identity.token = token;
      try {
        expect(
          (await receiveEvents(membershipPacket(credential.token))).status,
        ).toBe(503);
        expect(
          (
            await db.pool.query(
              'SELECT u."orgMember",d.revoked_at,d.token_hash FROM "user" u JOIN telemetry_devices d ON d.user_id=u.id WHERE u.id=$1',
              [user],
            )
          ).rows,
        ).toEqual([
          {
            orgMember: true,
            revoked_at: null,
            token_hash: tokenHash(credential.token),
          },
        ]);
        expect(
          (
            await db.pool.query(
              "SELECT code_hash FROM telemetry_codes WHERE code_hash=$1",
              [tokenHash(code)],
            )
          ).rows,
        ).toHaveLength(1);
        expect(
          (
            await db.pool.query(
              "SELECT event_id FROM telemetry_events WHERE device_id=$1",
              [credential.device_id],
            )
          ).rows,
        ).toHaveLength(0);
      } finally {
        identity.token = "fixture-github-token";
      }
    },
  );

  it.each(["initial", "renewal"] as const)(
    "membership removal cancels %s consent permanently; rejoining requires fresh consent",
    async (kind) => {
      const { user, credential } = await membershipDevice();
      const consent =
        kind === "renewal"
          ? { ...params, device_id: credential.device_id }
          : params;
      const code = await issueCode(db.pool, user, consent);
      await storeMembership(user, false);
      expect(
        (
          await db.pool.query(
            "SELECT code_hash FROM telemetry_codes WHERE user_id=$1",
            [user],
          )
        ).rows,
      ).toHaveLength(0);
      expect(await exchangeCode(db.pool, payload(code))).toBeNull();
      await expect(issueCode(db.pool, user, consent)).rejects.toBeInstanceOf(
        MembershipRequiredError,
      );
      await storeMembership(user, true);
      expect(await exchangeCode(db.pool, payload(code))).toBeNull();
      expect((await receiveEvents(eventRequest(credential.token))).status).toBe(
        401,
      );
      const fresh = (await exchangeCode(
        db.pool,
        payload(await issueCode(db.pool, user, consent)),
      ))!;
      if (kind === "renewal")
        expect(fresh.device_id).toBe(credential.device_id);
      expect((await receiveEvents(eventRequest(fresh.token))).status).toBe(200);
    },
  );

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
      expect(await exchangeCode(db.pool, payload(code))).toBeNull();
      expect((await receiveEvents(eventRequest(credential.token))).status).toBe(
        401,
      );
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
      expect((await receiveEvents(eventRequest(fresh.token))).status).toBe(401);
      expect((await receiveEvents(eventRequest(credential.token))).status).toBe(
        401,
      );
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
    expect((await receiveEvents(eventRequest(credential.token))).status).toBe(
      200,
    );
    expect(await exchangeCode(original, payload(code))).not.toBeNull();
  });

  it("refreshes a stale positive membership with PostgreSQL microsecond precision", async () => {
    const { user, credential } = await membershipDevice();
    await db.pool.query(
      `INSERT INTO account(id,issuer,"accountId","providerId","userId","updatedAt") VALUES($1,'https://github.com',$1,'github',$1,now())`,
      [user],
    );
    await db.pool.query(
      `UPDATE "user" SET "orgCheckedAt"=date_trunc('second',now()-interval '6 minutes')+interval '0.123456 seconds' WHERE id=$1`,
      [user],
    );
    expect(
      (
        await db.pool.query(
          'SELECT extract(microseconds from "orgCheckedAt")::int % 1000000 micros FROM "user" WHERE id=$1',
          [user],
        )
      ).rows[0].micros,
    ).toBe(123456);
    expect(await telemetryMembership(user)).toBe(true);
    expect(
      (await receiveEvents(membershipPacket(credential.token))).status,
    ).toBe(200);
  });
  it("a confirmed membership removal revokes every device and denies its queued batch", async () => {
    const { user, credential } = await membershipDevice();
    const second = (await exchangeCode(
      db.pool,
      payload(await issueCode(db.pool, user, params)),
    ))!;
    await issueCode(db.pool, user, params);
    await issueCode(db.pool, user, {
      ...params,
      device_id: credential.device_id,
    });
    await db.pool.query(
      `INSERT INTO account(id,issuer,"accountId","providerId","userId","updatedAt") VALUES($1,'https://github.com',$1,'github',$1,now())`,
      [user],
    );
    await db.pool.query(
      `UPDATE "user" SET "orgCheckedAt"=now()-interval '6 minutes' WHERE id=$1`,
      [user],
    );
    identity.member = false;
    try {
      expect(
        (await receiveEvents(membershipPacket(credential.token))).status,
      ).toBe(401);
    } finally {
      identity.member = true;
    }
    expect((await receiveEvents(membershipPacket(second.token))).status).toBe(
      401,
    );
    expect(
      (
        await db.pool.query(
          "SELECT code_hash FROM telemetry_codes WHERE user_id=$1",
          [user],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.pool.query(
          "SELECT count(*)::int count FROM telemetry_devices WHERE user_id=$1 AND revoked_at IS NULL",
          [user],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    expect(
      (
        await db.pool.query(
          "SELECT count(*)::int count FROM telemetry_events WHERE device_id=$1",
          [credential.device_id],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });
  it("membership removal waits for an already locked ingestion batch to finish atomically", async () => {
    const { user, credential } = await membershipDevice();
    const original = db.pool;
    const locked = Promise.withResolvers<void>();
    const proceed = Promise.withResolvers<void>();
    db.pool = {
      query: original.query.bind(original),
      connect: async () => {
        const client = await original.connect();
        return {
          query: async (sql: string, values?: unknown[]) => {
            const result = await client.query(sql, values);
            if (sql.includes('FROM "user"') && sql.endsWith("FOR SHARE")) {
              locked.resolve();
              await proceed.promise;
            }
            return result;
          },
          release: () => client.release(),
        };
      },
    } as unknown as pg.Pool;
    const ingest = receiveEvents(membershipPacket(credential.token));
    let removal: Promise<void> | undefined;
    try {
      await locked.promise;
      removal = storeMembership(user, false);
      await expect
        .poll(
          async () =>
            (
              await admin.query(
                `SELECT count(*)::int count FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'UPDATE "user" SET "orgMember"%'`,
              )
            ).rows[0].count,
          { timeout: 1000, interval: 10 },
        )
        .toBe(1);
      proceed.resolve();
      expect((await ingest).status).toBe(200);
      await removal;
      expect(
        (await receiveEvents(membershipPacket(credential.token))).status,
      ).toBe(401);
      expect(
        (
          await original.query(
            "SELECT count(*)::int count FROM telemetry_events WHERE device_id=$1",
            [credential.device_id],
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    } finally {
      proceed.resolve();
      await Promise.allSettled([ingest, ...(removal ? [removal] : [])]);
      db.pool = original;
    }
  });
  it("a membership removal that locks first prevents ingestion from committing stale authorization", async () => {
    const { user, credential } = await membershipDevice();
    const remover = await db.pool.connect();
    await remover.query("BEGIN");
    await remover.query('UPDATE "user" SET "orgMember"=false WHERE id=$1', [
      user,
    ]);
    const ingest = receiveEvents(membershipPacket(credential.token));
    try {
      await expect
        .poll(
          async () =>
            (
              await admin.query(
                `SELECT count(*)::int count FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'SELECT %FROM "user"%FOR SHARE'`,
              )
            ).rows[0].count,
          { timeout: 1000, interval: 10 },
        )
        .toBe(1);
      await remover.query("COMMIT");
      expect((await ingest).status).toBe(401);
      expect(
        (
          await db.pool.query(
            "SELECT count(*)::int count FROM telemetry_events WHERE device_id=$1",
            [credential.device_id],
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
    } finally {
      await remover.query("ROLLBACK");
      remover.release();
      await Promise.allSettled([ingest]);
    }
  });

  it("retries membership expiry between the initial check and final lock without losing the batch", async () => {
    const { user, credential } = await membershipDevice();
    const original = db.pool;
    await original.query(
      `INSERT INTO account(id,issuer,"accountId","providerId","userId","updatedAt") VALUES($1,'https://github.com',$1,'github',$1,now())`,
      [user],
    );
    await original.query(
      `UPDATE "user" SET "orgCheckedAt"=now()-interval '4 minutes 59 seconds' WHERE id=$1`,
      [user],
    );
    let crossedBoundary = false;
    db.pool = {
      query: original.query.bind(original),
      connect: async () => {
        if (!crossedBoundary) {
          crossedBoundary = true;
          // Advance the stored age after the optimistic read, without sleeping
          // or changing the host/DB clock. Only this fixture user's row changes.
          await original.query(
            `UPDATE "user" SET "orgCheckedAt"=now()-interval '5 minutes 1 millisecond' WHERE id=$1`,
            [user],
          );
        }
        return original.connect();
      },
    } as unknown as pg.Pool;
    try {
      expect(
        (await receiveEvents(membershipPacket(credential.token))).status,
      ).toBe(503);
      expect(crossedBoundary).toBe(true);
      expect(
        (
          await original.query(
            "SELECT revoked_at FROM telemetry_devices WHERE device_id=$1",
            [credential.device_id],
          )
        ).rows[0].revoked_at,
      ).toBeNull();
      expect(
        (
          await original.query(
            "SELECT count(*)::int count FROM telemetry_events WHERE device_id=$1",
            [credential.device_id],
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      // Retry performs the provider refresh outside the ingestion transaction.
      // A repeated delivery remains idempotent after the successful retry.
      for (let attempt = 0; attempt < 2; attempt++)
        expect(
          (await receiveEvents(membershipPacket(credential.token))).status,
        ).toBe(200);
      expect(
        (
          await original.query(
            "SELECT count(*)::int count FROM telemetry_events WHERE device_id=$1",
            [credential.device_id],
          )
        ).rows,
      ).toEqual([{ count: 1 }]);
    } finally {
      db.pool = original;
    }
  });

  it.each([-600000, 600000])(
    "uses the database membership clock when the app clock differs by %i milliseconds",
    async (skew) => {
      const { credential } = await membershipDevice();
      const actualNow = Date.now();
      const clock = vi.spyOn(Date, "now").mockReturnValue(actualNow + skew);
      try {
        expect(
          (await receiveEvents(membershipPacket(credential.token))).status,
        ).toBe(200);
      } finally {
        clock.mockRestore();
      }
    },
  );

  it("refreshes a membership timestamp in the database's future", async () => {
    const { user, credential } = await membershipDevice();
    await db.pool.query(
      `INSERT INTO account(id,issuer,"accountId","providerId","userId","updatedAt") VALUES($1,'https://github.com',$1,'github',$1,now())`,
      [user],
    );
    await db.pool.query(
      `UPDATE "user" SET "orgCheckedAt"=now()+interval '10 minutes' WHERE id=$1`,
      [user],
    );
    expect(
      (await receiveEvents(membershipPacket(credential.token))).status,
    ).toBe(200);
    expect(
      (
        await db.pool.query(
          'SELECT "orgCheckedAt"<=now() AS checked FROM "user" WHERE id=$1',
          [user],
        )
      ).rows,
    ).toEqual([{ checked: true }]);
  });

  it("recovers from an expired revoke form only after a fresh form submission", async () => {
    const credential = (await exchangeCode(
      db.pool,
      payload(await issueCode(db.pool, "telemetry-test-user", params)),
    ))!;
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
