import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), query: vi.fn() }));
vi.mock("./auth", () => ({
  getAuth: () => ({ api: { getSession: mocks.session } }),
}));
vi.mock("./db", () => ({ getPool: () => ({ query: mocks.query }) }));
import { devicesGet } from "./telemetry-http";

const device = (n: number) => ({
  device_id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  created_at: new Date("2026-01-01T00:00:00Z"),
  expires_at: new Date("2099-01-01T00:00:00Z"),
  revoked_at: null,
});
const request = (suffix = "") =>
  new Request("https://home.example/telemetry/devices" + suffix);
beforeEach(() => {
  vi.stubEnv("TELEMETRY_ENABLED", "1");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-only");
  mocks.session.mockResolvedValue({
    user: { id: "owner" },
    session: { id: "session" },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

it("offers the next page without rendering more than 100 device forms", async () => {
  mocks.query.mockResolvedValue({
    rows: Array.from({ length: 101 }, (_, i) => device(i + 1)),
  });
  const response = await devicesGet(request());
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(body.match(/<form /g)).toHaveLength(100);
  expect(body).toContain(`/telemetry/devices?before=${device(100).device_id}`);
  expect(body).not.toContain(device(101).device_id);
  expect(mocks.query.mock.calls[0][1]).toEqual(["owner", null]);
  expect(response.headers.get("cache-control")).toBe("no-store");
});

it("shows an older active device with its revoke control and a route back", async () => {
  mocks.query.mockResolvedValue({ rows: [device(101)] });
  const response = await devicesGet(
    request(`?before=${device(100).device_id}`),
  );
  const body = await response.text();
  expect(body).toContain(`value="${device(101).device_id}"`);
  expect(body).toContain("Revoke device");
  expect(body).toContain("Newest devices");
  expect(body).not.toContain("Older devices");
  expect(mocks.query.mock.calls[0][1]).toEqual([
    "owner",
    device(100).device_id,
  ]);
});

it.each([
  "?before=bad",
  "?before=",
  "?page=2",
  `?before=${device(1).device_id}&before=${device(2).device_id}`,
])("rejects malformed pagination without querying: %s", async (suffix) => {
  expect((await devicesGet(request(suffix))).status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
});

it("requires a session before exposing device history", async () => {
  mocks.session.mockResolvedValue(null);
  expect((await devicesGet(request())).status).toBe(401);
  expect(mocks.query).not.toHaveBeenCalled();
});
