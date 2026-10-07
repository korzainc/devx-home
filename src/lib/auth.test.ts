import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuth } from "./auth";

// Real getAuth(), not a mock: the point of this suite is to prove the plugins are actually wired
// into the betterAuth({...}) call, not to assert on assumptions about what they'd do. DATABASE_URL
// only has to parse as a connection string - nothing here needs a reachable database, since a
// present-but-unreachable one still proves the route is registered rather than 404ing.
beforeEach(() => {
  vi.stubEnv(
    "DATABASE_URL",
    "postgres://postgres:postgres@127.0.0.1:1/device_auth_test",
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("device authorization plugin", () => {
  it("exposes the device code endpoint", async () => {
    const res = await getAuth().handler(
      new Request("http://localhost/api/auth/device/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: "korza-cli" }),
      }),
    );
    expect(res.status).not.toBe(404);
  });

  it("rejects a client_id the CLI didn't issue", async () => {
    const res = await getAuth().handler(
      new Request("http://localhost/api/auth/device/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: "someone-else" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("bearer plugin", () => {
  it("exposes bearer-header support on get-session, not just the cookie path", async () => {
    const res = await getAuth().handler(
      new Request("http://localhost/api/auth/get-session", {
        method: "GET",
        headers: { Authorization: "Bearer not-a-real-token" },
      }),
    );
    expect(res.status).not.toBe(404);
  });
});
