// Opt-in real PostgreSQL evidence. Runs in a unique schema and refuses remote databases.
// getPool points production handlers at that real schema. The HTTP consent test substitutes
// only session/membership identity at the test boundary; real GitHub/browser acceptance is separate.
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";
import { localTelemetryTestDatabase } from "../test/telemetry-database";
const db = vi.hoisted(() => ({ pool: null as unknown as pg.Pool }));
vi.mock("./db", () => ({ getPool: () => db.pool }));
import { recordAnalysisRun, readAnalysisUsage } from "./analysis-usage";
const configured = process.env.TEST_TELEMETRY_DATABASE_URL;
const run = promisify(execFile);
describe.skipIf(!configured)("telemetry with isolated PostgreSQL", () => {
  const schema = `telemetry_test_${randomUUID().replaceAll("-", "")}`;
  let admin: pg.Pool;
  let connection: string;
  let created = false;
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
});
