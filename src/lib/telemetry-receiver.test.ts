import { afterEach, expect, it, vi } from "vitest";
import { receiveTelemetry } from "./telemetry-receiver";
import { isTelemetryPath } from "./telemetry-path";
const query = vi.hoisted(() => vi.fn().mockResolvedValue({ rows: [] }));
const release = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({
  getPool: () => ({ connect: async () => ({ query, release }) }),
}));
const token = "a".repeat(48);
function request(packet: unknown, auth = token) {
  return new Request("http://localhost/api/telemetry/logs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${auth}`,
    },
    body: JSON.stringify(packet),
  });
}
function packet(plugin = "humanizer") {
  const attrs = {
    "event.name": "skill_activated",
    "marketplace.name": "korza-marketplace",
    "plugin.name": plugin,
    "skill.name": "humanizer",
    "event.timestamp": "2026-09-22T10:00:00Z",
    "session.id": "test-session",
    "event.sequence": "1",
    prompt: "private text",
  };
  return {
    resourceLogs: [
      {
        scopeLogs: [
          {
            logRecords: [
              {
                attributes: Object.entries(attrs).map(([key, value]) => ({
                  key,
                  value: { stringValue: value },
                })),
              },
            ],
          },
        ],
      },
    ],
  };
}
afterEach(() => {
  vi.unstubAllEnvs();
  query.mockClear();
  release.mockClear();
});
it("fails closed outside development", async () => {
  vi.stubEnv("NODE_ENV", "production");
  expect((await receiveTelemetry(request({}), "logs")).status).toBe(404);
  expect(query).not.toHaveBeenCalled();
});
it("requires configured auth before parsing", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("TELEMETRY_INGEST_TOKEN", token);
  expect((await receiveTelemetry(request({}, "bad"), "logs")).status).toBe(401);
  expect(query).not.toHaveBeenCalled();
});
it("stores approved fields only and ignores unrelated plugins", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("TELEMETRY_INGEST_TOKEN", token);
  expect((await receiveTelemetry(request(packet()), "logs")).status).toBe(200);
  expect(JSON.stringify(query.mock.calls)).not.toContain("private text");
  expect(query).toHaveBeenCalledWith(
    expect.stringContaining("ON CONFLICT DO NOTHING"),
    expect.arrayContaining(["humanizer"]),
  );
  query.mockClear();
  expect(
    (await receiveTelemetry(request(packet("unrelated")), "logs")).status,
  ).toBe(200);
  expect(query).not.toHaveBeenCalled();
});
it("rejects malformed packets", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("TELEMETRY_INGEST_TOKEN", token);
  expect(
    (await receiveTelemetry(request({ resourceLogs: "bad" }), "logs")).status,
  ).toBe(400);
});
it("exempts only the two exact exporter endpoints from browser login", () => {
  expect(isTelemetryPath("/api/telemetry/logs")).toBe(true);
  expect(isTelemetryPath("/api/telemetry/metrics")).toBe(true);
  expect(isTelemetryPath("/api/telemetry/logs/other")).toBe(false);
  expect(isTelemetryPath("/api/telemetry")).toBe(false);
});
