import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock("./db", () => ({
  getPool: () => ({
    query: mocks.query,
    connect: async () => ({ query: mocks.query, release: mocks.release }),
  }),
}));
import { receiveEvents, revokeDevice } from "./telemetry-http";
const base = "https://home.example";
function ingest(body: unknown, token = "korza_" + "a".repeat(43)) {
  return new Request(base + "/api/telemetry/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}
function allowDevice() {
  mocks.query.mockResolvedValue({ rows: [{ device_id: "device" }] });
}
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("KORZA_LOCAL_USAGE", "1");
  vi.stubEnv("DATABASE_URL", "postgresql://fixture:unused@127.0.0.1/fixture");
  vi.stubEnv("TELEMETRY_ENABLED", "1");
  vi.stubEnv("TELEMETRY_ENROLLMENT_MODE", undefined);
  mocks.query.mockResolvedValue({ rows: [] });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
it("keeps rollout disabled until explicitly enabled", async () => {
  vi.stubEnv("TELEMETRY_ENABLED", "0");
  expect(
    (await receiveEvents(ingest({ events: [], metrics: [] }))).status,
  ).toBe(404);
  expect((await revokeDevice(ingest({}))).status).toBe(404);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("rejects missing, expired or revoked credentials before accepting telemetry", async () => {
  expect(
    (await receiveEvents(ingest({ events: [], metrics: [] }, "bad"))).status,
  ).toBe(401);
  expect(
    (await receiveEvents(ingest({ events: [], metrics: [] }))).status,
  ).toBe(401);
  expect(
    mocks.query.mock.calls.find(([sql]) =>
      sql.includes("SELECT device_id"),
    )?.[0],
  ).toContain("revoked_at IS NULL");
});
it("bounds the decoded request stream", async () => {
  allowDevice();
  expect(
    (
      await receiveEvents(
        ingest({ events: [], metrics: [], junk: "a".repeat(262144) }),
      )
    ).status,
  ).toBe(413);
});
it("writes a full batch in one database call per record type", async () => {
  allowDevice();
  const events = Array.from({ length: 500 }, (_, index) => ({
    id: index.toString(16).padStart(64, "0"),
    kind: "plugin_installed",
    client: "codex",
    source: "korza_cli",
    occurredAt: "2026-09-23T00:00:00Z",
    plugin: "superpowers",
    skill: null,
  }));
  const metrics = Array.from({ length: 500 }, (_, index) => ({
    id: index.toString(16).padStart(64, "0"),
    value: 1,
    temporality: 2,
    plugin: "codezen",
    skill: "codezen_brainstorm",
    invokeType: null,
  }));
  expect((await receiveEvents(ingest({ events, metrics }))).status).toBe(200);
  const writes = mocks.query.mock.calls.filter(([sql]) =>
    sql.startsWith("INSERT"),
  );
  expect(writes).toHaveLength(2);
});
it("rolls back both bulk writes if the metric statement fails", async () => {
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith("INSERT INTO telemetry_skill_metrics"))
      throw Error("injected bulk metric failure");
    return {
      rows:
        sql.startsWith("SELECT") || sql.startsWith("UPDATE telemetry_devices")
          ? [
              {
                device_id: "device",
              },
            ]
          : [],
    };
  });
  const packet = {
    events: [
      {
        id: "d".repeat(64),
        kind: "plugin_installed",
        client: "codex",
        source: "korza_cli",
        occurredAt: "2026-09-23T00:00:00Z",
        plugin: "superpowers",
        skill: null,
      },
    ],
    metrics: [
      {
        id: "e".repeat(64),
        value: 1,
        temporality: 2,
        plugin: "codezen",
        skill: null,
        invokeType: null,
      },
    ],
  };
  expect((await receiveEvents(ingest(packet))).status).toBe(503);
  expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  expect(mocks.query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
  expect(mocks.release).toHaveBeenCalledOnce();
});
it("allows bearer self-revocation and rejects invalid token", async () => {
  expect((await revokeDevice(ingest({}, "bad"))).status).toBe(401);
  mocks.query.mockResolvedValue({
    rows: [{ device_id: "device" }],
    rowCount: 1,
  });
  expect((await revokeDevice(ingest({}))).status).toBe(204);
  expect(
    mocks.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE"))?.[0],
  ).toContain("SET revoked_at = COALESCE(revoked_at, now())");
  expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
});
it("rechecks revocation inside the ingestion transaction", async () => {
  mocks.query.mockImplementation(async (sql: string) => ({
    rows:
      sql.includes("SELECT device_id") && !sql.includes("FOR UPDATE")
        ? [{ device_id: "device" }]
        : [],
  }));
  expect(
    (
      await receiveEvents(
        ingest({
          events: [
            {
              id: "b".repeat(64),
              kind: "plugin_installed",
              client: "codex",
              source: "korza_cli",
              occurredAt: "2026-09-23T00:00:00Z",
              plugin: "superpowers",
              skill: null,
            },
          ],
          metrics: [],
        }),
      )
    ).status,
  ).toBe(401);
  expect(mocks.query).toHaveBeenCalledWith(
    expect.stringMatching(/^SELECT device_id .* FOR UPDATE$/),
    [expect.any(String)],
  );
  expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(
    false,
  );
  expect(mocks.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  expect(mocks.release).toHaveBeenCalledOnce();
});
it("rejects invalid content type, encoded bodies and unknown fields without inserts", async () => {
  allowDevice();
  const req = ingest({ events: [], metrics: [] });
  req.headers.set("content-encoding", "gzip");
  expect((await receiveEvents(req)).status).toBe(415);
  const req2 = ingest({ events: [], metrics: [] });
  req2.headers.set("content-type", "text/plain");
  expect((await receiveEvents(req2)).status).toBe(415);
  expect(
    (await receiveEvents(ingest({ events: [], metrics: [], prompt: "secret" })))
      .status,
  ).toBe(400);
  expect(mocks.query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(
    false,
  );
});
it.each(["github", "typo"])(
  "refuses uploads for obsolete or unknown enrollment policy: %s",
  async (mode) => {
    vi.stubEnv("TELEMETRY_ENROLLMENT_MODE", mode);
    allowDevice();
    expect(
      (await receiveEvents(ingest({ events: [], metrics: [] }))).status,
    ).toBe(401);
    expect(mocks.query.mock.calls.some(([sql]) => sql === "BEGIN")).toBe(false);
  },
);
it.each(["preview", "development"])(
  "disables every device route on %s",
  async (deployment) => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", deployment);
    expect(
      (await receiveEvents(ingest({ events: [], metrics: [] }))).status,
    ).toBe(404);
    expect((await revokeDevice(ingest({}))).status).toBe(404);
    expect(mocks.query).not.toHaveBeenCalled();
  },
);
it.each([
  { operation: "revoke", run: () => revokeDevice(ingest({})) },
  {
    operation: "ingest",
    run: () => receiveEvents(ingest({ events: [], metrics: [] })),
  },
])(
  "logs only safe outage context for $operation",
  async ({ operation, run }) => {
    const error = Object.assign(new Error("fixture-secret-token"), {
      detail: "fixture-private-sql-values",
      code: "fixture-private-provider-response",
    });
    mocks.query.mockRejectedValue(error);
    const response = await run();
    expect(response.status).toBe(503);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "Telemetry request failed.",
      { operation, stage: "storage", status: 503 },
    );
  },
);
it("does not report client rejections or disabled routes as outages", async () => {
  expect((await receiveEvents(ingest({}, "invalid-token"))).status).toBe(401);
  allowDevice();
  expect(
    (await receiveEvents(ingest({ prompt: "fixture-private-prompt" }))).status,
  ).toBe(400);
  vi.stubEnv("TELEMETRY_ENABLED", "0");
  expect(
    (await receiveEvents(ingest({ events: [], metrics: [] }))).status,
  ).toBe(404);
  expect(console.error).not.toHaveBeenCalled();
});
