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
  type TransactionPool,
} from "./telemetry-auth";
const db = vi.hoisted(() => ({ pool: null as unknown as pg.Pool }));
vi.mock("./db", () => ({ getPool: () => db.pool }));
const identity = vi.hoisted(() => ({ member: true }));
vi.mock("./auth", () => ({
  getAuth: () => ({
    api: {
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
vi.mock("./membership", () => ({ isOrgMember: async () => identity.member }));
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
import { readPluginInstalls, readSkillUsage } from "./skill-usage";
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
    const reached = Promise.withResolvers<void>();
    const proceed = Promise.withResolvers<void>();
    const pool: TransactionPool = {
      connect: async () => {
        const client = await db.pool.connect();
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
      `INSERT INTO "user"(id,name,email,"emailVerified") VALUES('telemetry-test-user','test','test@example.invalid',false)`,
    );
    vi.stubEnv("TELEMETRY_ENABLED", "1");
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
      `INSERT INTO "user"(id,name,email,"emailVerified") VALUES('different-user','test','other@example.invalid',false)`,
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
          plugin: "humanizer",
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
      expect((await consent()).status).toBe(403);
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
      claudeNative: (before.claudeNative ?? 0) + 1,
      claudeKorza: (before.claudeKorza ?? 0) + 1,
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
      plugin: "humanizer",
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
    expect(storedEvent.rows).toEqual([{ plugin: "humanizer" }]);
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
                plugin: "humanizer",
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
      'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$1,$2,false)',
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
});
