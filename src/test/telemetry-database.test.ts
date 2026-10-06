import { describe, expect, it } from "vitest";
import pg from "pg";
import { localTelemetryTestDatabase } from "./telemetry-database";

describe("telemetry integration database isolation", () => {
  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "accepts loopback %s with the expected effective pg host",
    (host) => {
      const url = localTelemetryTestDatabase(
        `postgres://test:fixture@${host}:5432/test?sslmode=verify-full`,
      );
      // Constructing a client parses the actual driver configuration without connecting.
      const client = new pg.Client({ connectionString: url.toString() });
      expect(client.host).toBe(host);
      expect(url.searchParams.get("sslmode")).toBe("disable");
    },
  );

  it.each([
    "postgres://remote.example/test",
    "https://localhost/test",
    "postgres://localhost/test?host=remote.example",
    "postgres://localhost/test?%68ost=remote.example",
    "postgres://localhost/test?host=127.0.0.1&host=remote.example",
    "postgres://localhost/test?hostaddr=203.0.113.1",
    "postgres://localhost/test?port=5433",
    "postgres://localhost/test?dbname=production",
    "postgres://localhost/test?options=-csearch_path%3Dpublic",
    "postgres://localhost/test?connectionString=postgres://remote.example/test",
  ])("rejects connection overrides before any database access: %s", (value) => {
    expect(() => localTelemetryTestDatabase(value)).toThrow(
      "Integration database must be loopback without URL overrides",
    );
  });

  it("does not echo secrets from malformed URLs", () => {
    const malformed = "postgres://user:fixture-secret@[invalid/test";
    expect(() => localTelemetryTestDatabase(malformed)).toThrow(
      /^Invalid integration database URL$/,
    );
  });
});
