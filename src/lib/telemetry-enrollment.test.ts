import { afterEach, beforeEach, expect, it, vi } from "vitest";
const connect = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getPool: () => ({ connect }) }));
import { enrollmentGet, enrollmentPost } from "./telemetry-enrollment";

const bearer = "korza_" + "a".repeat(43);
function request(body: unknown = { consent: true }, extra = {}) {
  return new Request("http://localhost/api/telemetry/enroll", {
    method: "POST",
    headers: {
      authorization: `Bearer ${bearer}`,
      "content-type": "application/json",
      ...extra,
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("TELEMETRY_ENABLED", "1");
  vi.stubEnv("TELEMETRY_ENROLLMENT_MODE", "consent");
  vi.stubEnv("KORZA_LOCAL_USAGE", "1");
  vi.stubEnv("DATABASE_URL", "postgresql://127.0.0.1/fixture");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("advertises consent only when explicitly enabled and never caches policy", async () => {
  expect(await enrollmentGet().json()).toEqual({ mode: "consent" });
  expect(enrollmentGet().headers.get("cache-control")).toBe("no-store");
  vi.stubEnv("TELEMETRY_ENROLLMENT_MODE", undefined);
  expect(await enrollmentGet().json()).toEqual({ mode: "github" });
  expect((await enrollmentPost(request())).status).toBe(404);
  vi.stubEnv("TELEMETRY_ENROLLMENT_MODE", "typo");
  expect(enrollmentGet().status).toBe(503);
  vi.stubEnv("TELEMETRY_ENROLLMENT_MODE", "consent");
  vi.stubEnv("TELEMETRY_ENABLED", "0");
  expect(enrollmentGet().status).toBe(404);
  expect((await enrollmentPost(request())).status).toBe(404);
  expect(connect).not.toHaveBeenCalled();
});
it.each([
  false,
  null,
  [],
  {},
  { consent: false },
  { consent: true, device_id: "other" },
])("rejects missing consent and caller-supplied identity: %j", async (body) => {
  expect((await enrollmentPost(request(body))).status).toBe(400);
  expect(connect).not.toHaveBeenCalled();
});
it("rejects browser requests, invalid bearers, encodings and oversized bodies before storage", async () => {
  expect(
    (
      await enrollmentPost(
        request({ consent: true }, { origin: "http://localhost" }),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await enrollmentPost(
        request({ consent: true }, { authorization: "Bearer invalid" }),
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await enrollmentPost(
        request({ consent: true }, { "content-encoding": "gzip" }),
      )
    ).status,
  ).toBe(415);
  expect((await enrollmentPost(request("a".repeat(1024)))).status).toBe(413);
  expect(connect).not.toHaveBeenCalled();
});
it("keeps Preview disabled even when consent collection was configured", async () => {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("VERCEL_ENV", "preview");
  expect(enrollmentGet().status).toBe(404);
  expect((await enrollmentPost(request())).status).toBe(404);
  expect(connect).not.toHaveBeenCalled();
});
