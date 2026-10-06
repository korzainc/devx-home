// Opt-in real PostgreSQL evidence. Runs in a unique schema and refuses remote databases.
// Framework request context is substituted only for the loopback HTTP adapter; no company identity is used.
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { localTelemetryTestDatabase } from "../test/telemetry-database";
const db = vi.hoisted(() => ({ pool: null as unknown as pg.Pool }));
vi.mock("./db", () => ({ getPool: () => db.pool }));
vi.mock("next/server", () => ({ connection: async () => {} }));
const companyAuth = vi.hoisted(() =>
  vi.fn(() => {
    throw Error("Company auth must not run");
  }),
);
vi.mock("./auth", () => ({ getAuth: companyAuth }));
vi.mock("./membership", () => ({ isOrgMember: companyAuth }));
import {
  GET as enrollGET,
  POST as enrollPOST,
} from "../app/api/telemetry/enroll/route";
import { POST as eventsPOST } from "../app/api/telemetry/events/route";
import { POST as revokePOST } from "../app/api/telemetry/revoke/route";
import { receiveEvents, revokeDevice } from "./telemetry-http";
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
  async function freshDevice() {
    const token = "korza_" + randomBytes(32).toString("base64url");
    const response = await enrollPOST(
      new Request("http://localhost/api/telemetry/enroll", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ consent: true }),
      }),
    );
    expect(response.status).toBe(200);
    return { token, ...(await response.json()) };
  }
  const eventRequest = (
    token: string,
    body: unknown = { events: [], metrics: [] },
  ) =>
    new Request("http://localhost/api/telemetry/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
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
    vi.stubEnv("TELEMETRY_ENABLED", "1");
    vi.stubEnv("TELEMETRY_ENROLLMENT_MODE", undefined);
    vi.stubEnv("KORZA_LOCAL_USAGE", "1");
    vi.stubEnv("DATABASE_URL", connection);
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("VERCEL_ENV", "");
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
    expect(companyAuth).not.toHaveBeenCalled();
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
  it("deduplicates retries and separates devices; revocation and expiry immediately reject ingest", async () => {
    const first = await freshDevice();
    const second = await freshDevice();
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
    const request = (token: string) => eventRequest(token, body);
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
  it("serves enrollment, normalized ingestion, renewal and revocation over real HTTP", async () => {
    const routes: Record<string, (request: Request) => Promise<Response>> = {
      "GET /api/telemetry/enroll": enrollGET,
      "POST /api/telemetry/enroll": enrollPOST,
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
    const bearer = "korza_" + randomBytes(32).toString("base64url");
    const enroll = (body: unknown, extra: Record<string, string> = {}) =>
      fetch(origin + "/api/telemetry/enroll", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${bearer}`,
          ...extra,
        },
        body: JSON.stringify(body),
      });
    try {
      const policy = await fetch(origin + "/api/telemetry/enroll");
      expect(policy.status).toBe(200);
      expect(await policy.json()).toEqual({ mode: "consent" });
      expect(policy.headers.get("cache-control")).toBe("no-store");
      expect((await enroll({ consent: true }, { origin })).status).toBe(403);
      expect((await enroll({ consent: false })).status).toBe(400);
      expect(
        (await enroll({ consent: true }, { authorization: "Bearer invalid" }))
          .status,
      ).toBe(401);
      expect((await enroll({ consent: true, renew: true })).status).toBe(401);
      const enrolled = await enroll({ consent: true });
      expect(enrolled.status).toBe(200);
      expect(enrolled.headers.get("cache-control")).toBe("no-store");
      const credential = await enrolled.json();
      expect(Object.keys(credential).sort()).toEqual([
        "device_id",
        "expires_at",
        "mode",
      ]);
      expect(credential.mode).toBe("consent");
      const renewed = await enroll({ consent: true, renew: true });
      expect(renewed.status).toBe(200);
      expect((await renewed.json()).device_id).toBe(credential.device_id);
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
            authorization: `Bearer ${bearer}`,
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
            headers: { authorization: `Bearer ${bearer}` },
          })
        ).status,
      ).toBe(204);
      expect((await send(body)).status).toBe(401);
      expect((await enroll({ consent: true, renew: true })).status).toBe(401);
    } finally {
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
  it("retains replay-safe source rows and totals recorded installs per client", async () => {
    const credential = await freshDevice();
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
      receiveEvents(eventRequest(credential.token, { events, metrics: [] }));
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    expect(await readPluginInstalls("mattpocock-skills")).toEqual({
      ...before,
      claude: Number(before.claude ?? 0) + 2,
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
    const credential = await freshDevice();
    const metrics = [Number.MAX_SAFE_INTEGER, 1, 1].map((value, index) => ({
      id: String(index + 1).repeat(64),
      value,
      temporality: 2,
      plugin: "superpowers",
      skill: "superpowers_exact-total",
      invokeType: null,
    }));
    const response = await receiveEvents(
      eventRequest(credential.token, { events: [], metrics }),
    );
    expect(response.status).toBe(200);
    expect(await readSkillUsage("superpowers", ["exact-total"])).toEqual({
      "exact-total": { codex: "9007199254740993" },
    });
  });
  it("records successful skill loads without failed injections or replay duplicates", async () => {
    const credential = await freshDevice();
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
        eventRequest(credential.token, { events: [], metrics }),
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
    const credential = await freshDevice();
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
        (await receiveEvents(eventRequest(credential.token, body))).status,
      ).toBe(200);
    const { rows } = await db.pool.query(
      "SELECT count(*)::int count,sum(value)::int total FROM telemetry_skill_metrics WHERE device_id=$1",
      [credential.device_id],
    );
    expect(rows).toEqual([{ count: 1000, total: 1000 }]);
  });
  it("bulk ingestion preserves first metadata and greatest duplicate counter values", async () => {
    const credential = await freshDevice();
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
      receiveEvents(eventRequest(credential.token, body));
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
    const credential = await freshDevice();
    await db.pool.query(
      "ALTER TABLE telemetry_skill_metrics ADD CONSTRAINT telemetry_batch_failure CHECK(value <> 8888)",
    );
    try {
      const response = await receiveEvents(
        eventRequest(credential.token, {
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
});
