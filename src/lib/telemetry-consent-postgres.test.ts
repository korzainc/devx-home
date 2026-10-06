// Real SQL in an owned schema. No GitHub identity substitution is needed or allowed.
import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";
import { localTelemetryTestDatabase } from "../test/telemetry-database";
const db = vi.hoisted(() => ({ pool: null as unknown as pg.Pool }));
const companyAuth = vi.hoisted(() =>
  vi.fn(() => {
    throw Error("Company auth must not run");
  }),
);
vi.mock("./db", () => ({ getPool: () => db.pool }));
vi.mock("./auth", () => ({ getAuth: companyAuth }));
vi.mock("./membership", () => ({ isOrgMember: companyAuth }));
vi.mock("./telemetry-membership", async (original) => ({
  ...(await original<typeof import("./telemetry-membership")>()),
  telemetryMembership: companyAuth,
}));
import { POST as enroll } from "../app/api/telemetry/enroll/route";
import { POST as ingest } from "../app/api/telemetry/events/route";
import { POST as revoke } from "../app/api/telemetry/revoke/route";
import { tokenHash } from "./telemetry-auth";
const configured = process.env.TEST_TELEMETRY_DATABASE_URL;
describe.skipIf(!configured)(
  "consent-only telemetry with isolated PostgreSQL",
  () => {
    const schema = `telemetry_test_${randomUUID().replaceAll("-", "")}`;
    let admin: pg.Pool;
    let created = false;
    const token = () => "korza_" + randomBytes(32).toString("base64url");
    const request = (path: string, bearer: string, body?: unknown) =>
      new Request(`http://localhost/api/telemetry/${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const register = (bearer: string) =>
      enroll(request("enroll", bearer, { consent: true }));
    const packet = {
      events: [
        {
          id: "a".repeat(64),
          kind: "plugin_installed",
          occurredAt: "2026-10-06T00:00:00Z",
          plugin: "codezen",
          skill: null,
          client: "claude",
          source: "korza_cli",
        },
      ],
      metrics: [
        {
          id: "b".repeat(64),
          value: 2,
          temporality: 2,
          plugin: "codezen",
          skill: "codezen_code-review",
          invokeType: null,
        },
      ],
    };
    beforeAll(async () => {
      const url = localTelemetryTestDatabase(configured!);
      admin = new pg.Pool({ connectionString: url.toString() });
      await admin.query(`CREATE SCHEMA ${schema}`);
      created = true;
      url.searchParams.set("options", `-c search_path=${schema}`);
      const connection = url.toString();
      db.pool = new pg.Pool({ connectionString: connection });
      await promisify(execFile)(process.execPath, ["scripts/migrate.mjs"], {
        env: { ...process.env, DATABASE_URL_UNPOOLED: connection },
      });
      vi.stubEnv("TELEMETRY_ENABLED", "1");
      vi.stubEnv("TELEMETRY_ENROLLMENT_MODE", "consent");
      vi.stubEnv("KORZA_LOCAL_USAGE", "1");
      vi.stubEnv("DATABASE_URL", connection);
      vi.stubEnv("VERCEL", "");
      vi.stubEnv("VERCEL_ENV", "");
      vi.stubEnv("GITHUB_APP_CLIENT_ID", "");
      vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "");
      vi.stubEnv("BETTER_AUTH_SECRET", "");
    }, 20000);
    afterEach(async () => {
      expect(companyAuth).not.toHaveBeenCalled();
      await db.pool.query("TRUNCATE telemetry_devices CASCADE");
      vi.stubEnv("TELEMETRY_ENROLLMENT_MODE", "consent");
    });
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
    it("registers, renews and records without company accounts, preserving retry counts and provenance", async () => {
      const bearer = token();
      const results = await Promise.all([register(bearer), register(bearer)]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      const [first, retried] = await Promise.all(results.map((r) => r.json()));
      expect(first.device_id).toBe(retried.device_id);
      expect(first.mode).toBe("consent");
      expect(first).not.toHaveProperty("token");
      expect(
        (await db.pool.query('SELECT count(*)::int AS total FROM "user"'))
          .rows[0].total,
      ).toBe(0);
      const stored = (
        await db.pool.query(
          "SELECT user_id,identity_kind,token_hash,expires_at>now() AND expires_at<=now()+interval '12 hours' AS bounded FROM telemetry_devices",
        )
      ).rows[0];
      expect(stored).toMatchObject({
        user_id: null,
        identity_kind: "consent",
        token_hash: tokenHash(bearer),
        bounded: true,
      });
      for (let n = 0; n < 2; n++)
        expect((await ingest(request("events", bearer, packet))).status).toBe(
          200,
        );
      expect(
        (
          await db.pool.query(
            "SELECT count(*)::int AS total,min(identity_kind) AS kind FROM telemetry_events",
          )
        ).rows[0],
      ).toEqual({ total: 1, kind: "consent" });
      expect(
        (
          await db.pool.query(
            "SELECT sum(value)::int AS total,min(identity_kind) AS kind FROM telemetry_skill_metrics",
          )
        ).rows[0],
      ).toEqual({ total: 2, kind: "consent" });
      await db.pool.query(
        "UPDATE telemetry_devices SET expires_at=now()-interval '1 second'",
      );
      expect((await ingest(request("events", bearer, packet))).status).toBe(
        401,
      );
      const renewed = await (await register(bearer)).json();
      expect(renewed.device_id).toBe(first.device_id);
      expect((await ingest(request("events", bearer, packet))).status).toBe(
        200,
      );
      expect(
        (
          await db.pool.query(
            "SELECT sum(value)::int AS total FROM telemetry_skill_metrics",
          )
        ).rows[0].total,
      ).toBe(2);
      vi.stubEnv("TELEMETRY_ENROLLMENT_MODE", "github");
      expect((await ingest(request("events", bearer, packet))).status).toBe(
        401,
      );
      expect((await register(bearer)).status).toBe(404);
    });
    it("never revives a revoked bearer, including a concurrent renewal", async () => {
      const bearer = token();
      expect((await register(bearer)).status).toBe(200);
      const [renewal, disabled] = await Promise.all([
        register(bearer),
        revoke(request("revoke", bearer)),
      ]);
      expect([200, 401]).toContain(renewal.status);
      expect(disabled.status).toBe(204);
      expect((await register(bearer)).status).toBe(401);
      expect((await ingest(request("events", bearer, packet))).status).toBe(
        401,
      );
      expect((await revoke(request("revoke", bearer))).status).toBe(204);
      expect((await register(token())).status).toBe(200);
    });
    it("background renewal cannot register a missing device or claim another identity", async () => {
      const bearer = token();
      expect(
        (
          await enroll(
            request("enroll", bearer, { consent: true, renew: true }),
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await db.pool.query(
            "SELECT count(*)::int total FROM telemetry_devices",
          )
        ).rows[0].total,
      ).toBe(0);
      const initial = await (await register(bearer)).json();
      const renewed = await enroll(
        request("enroll", bearer, { consent: true, renew: true }),
      );
      expect(renewed.status).toBe(200);
      expect((await renewed.json()).device_id).toBe(initial.device_id);
      expect(
        (
          await enroll(
            request("enroll", token(), { consent: true, renew: true }),
          )
        ).status,
      ).toBe(401);
      expect(
        (
          await db.pool.query(
            "SELECT count(*)::int total FROM telemetry_devices",
          )
        ).rows[0].total,
      ).toBe(1);
    });
    it("bounds new registrations and device traffic while allowing recovery and existing-device renewal", async () => {
      const bearer = token();
      const device = await (await register(bearer)).json();
      await db.pool.query(
        "INSERT INTO telemetry_devices(device_id,user_id,token_hash,expires_at,identity_kind) SELECT gen_random_uuid(),NULL,'cap-'||n,now()+interval '1 hour','consent' FROM generate_series(1,59) n",
      );
      expect((await register(token())).status).toBe(429);
      expect((await register(bearer)).status).toBe(200);
      await db.pool.query(
        "UPDATE telemetry_devices SET created_at=now()-interval '2 minutes'",
      );
      expect((await register(token())).status).toBe(200);
      await db.pool.query(
        "UPDATE telemetry_devices SET window_records=4999 WHERE device_id=$1",
        [device.device_id],
      );
      expect((await ingest(request("events", bearer, packet))).status).toBe(
        429,
      );
      expect(
        (
          await db.pool.query(
            "SELECT count(*)::int AS total FROM telemetry_events",
          )
        ).rows[0].total,
      ).toBe(0);
      await db.pool.query(
        "UPDATE telemetry_devices SET window_started_at=now()-interval '2 minutes' WHERE device_id=$1",
        [device.device_id],
      );
      expect((await ingest(request("events", bearer, packet))).status).toBe(
        200,
      );
      expect(
        (
          await db.pool.query(
            "SELECT window_records FROM telemetry_devices WHERE device_id=$1",
            [device.device_id],
          )
        ).rows[0].window_records,
      ).toBe(2);
    });
  },
);
