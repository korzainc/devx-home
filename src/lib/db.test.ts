import type { Pool, PoolConfig } from "pg";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const offline = vi.hoisted(() => ({
  hang: false,
  clients: [] as { abort(): void }[],
  pools: [] as Pool[],
  options: [] as PoolConfig[],
  query: vi.fn(),
}));

// Keep pg-pool's real acquisition, timeout and queue management. Only its client
// transport is replaced, so these tests cannot connect to a database.
vi.mock("pg", async (importOriginal) => {
  const pg = await importOriginal<typeof import("pg")>();
  const { EventEmitter } = await import("node:events");
  class OfflineClient extends EventEmitter {
    _queryable = true;
    private connecting?: (error?: Error) => void;
    connection = { stream: { destroy: () => this.abort() } };

    constructor() {
      super();
      offline.clients.push(this);
    }

    connect(callback: (error?: Error) => void) {
      if (offline.hang) this.connecting = callback;
      else callback();
    }

    abort() {
      const callback = this.connecting;
      this.connecting = undefined;
      callback?.(new Error("Offline connection aborted"));
    }

    query(
      config: unknown,
      _values: unknown,
      callback: (error: null, result: { rows: unknown[] }) => void,
    ) {
      offline.query(config);
      callback(null, { rows: [] });
    }

    end(callback: () => void) {
      callback();
    }
  }

  return {
    ...pg,
    Pool: class extends pg.Pool {
      constructor(options: PoolConfig) {
        super({
          ...options,
          Client: OfflineClient as unknown as PoolConfig["Client"],
        });
        offline.options.push(options);
        offline.pools.push(this);
      }
    },
  };
});

beforeEach(() => {
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("KORZA_LOCAL_USAGE", "1");
  vi.stubEnv("DATABASE_URL", "postgresql://fixture:unused@127.0.0.1/fixture");
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://fixture:unused@127.0.0.1/fixture?sslmode=require",
  );
  offline.hang = false;
  offline.clients.length = 0;
  offline.pools.length = 0;
  offline.options.length = 0;
  offline.query.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  for (const client of offline.clients) client.abort();
  await Promise.all(offline.pools.map((pool) => pool.end()));
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("defers database configuration until the pool is requested", async () => {
  vi.stubEnv("DATABASE_URL", "");
  const { getPool } = await import("./db");
  expect(offline.pools).toHaveLength(0);
  expect(getPool).toThrow("DATABASE_URL is not set.");
});

it("retains the shared lazy pool and certificate-verifying TLS", async () => {
  const { getPool } = await import("./db");
  expect(getPool()).toBe(getPool());
  expect(offline.pools).toHaveLength(1);
  expect(
    new URL(offline.options[0].connectionString!).searchParams.get("sslmode"),
  ).toBe("verify-full");
  expect(offline.clients).toHaveLength(0);
});

it("finishes best-effort recording when a connection never becomes ready", async () => {
  offline.hang = true;
  const { getPool } = await import("./db");
  const { recordAnalysisRun } = await import("./analysis-usage");
  let finished = false;
  const recording = recordAnalysisRun(
    "11111111-1111-4111-8111-111111111111",
    42,
  ).then(() => {
    finished = true;
  });

  await vi.advanceTimersByTimeAsync(5000);
  const finishedWithinDeadline = finished;
  const pendingConnections = getPool().totalCount;
  // Release the negative-control fixture too, so a regression never hangs tests.
  for (const client of offline.clients) client.abort();
  await recording;

  expect(finishedWithinDeadline).toBe(true);
  expect(pendingConnections).toBe(0);
  expect(offline.query).not.toHaveBeenCalled();
});

it("removes timed-out recording from a saturated pool instead of writing later", async () => {
  const { getPool } = await import("./db");
  const { recordAnalysisRun } = await import("./analysis-usage");
  const pool = getPool();
  const clients = await Promise.all(
    Array.from({ length: 10 }, () => pool.connect()),
  );
  let finished = false;
  const recording = recordAnalysisRun(
    "11111111-1111-4111-8111-111111111111",
    42,
  ).then(() => {
    finished = true;
  });

  let finishedWithinDeadline: boolean;
  let waitingAfterDeadline: number;
  try {
    expect(pool.waitingCount).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    finishedWithinDeadline = finished;
    waitingAfterDeadline = pool.waitingCount;
  } finally {
    for (const client of clients) client.release();
  }
  await recording;

  expect(finishedWithinDeadline).toBe(true);
  expect(waitingAfterDeadline).toBe(0);
  expect(offline.query).not.toHaveBeenCalled();
});
