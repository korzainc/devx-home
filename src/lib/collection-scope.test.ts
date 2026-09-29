import { afterEach, beforeEach, expect, it, vi } from "vitest";
import pg from "pg";
import { usageCollectionEnabled } from "./collection-scope";

beforeEach(() => {
  for (const key of [
    "VERCEL",
    "VERCEL_ENV",
    "KORZA_LOCAL_USAGE",
    "DATABASE_URL",
  ])
    vi.stubEnv(key, "");
});
afterEach(() => vi.unstubAllEnvs());

it.each(["preview", "development", "unexpected", ""])(
  "blocks hosted %s collection even with a local override",
  (environment) => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", environment);
    vi.stubEnv("KORZA_LOCAL_USAGE", "1");
    vi.stubEnv("DATABASE_URL", "postgresql://127.0.0.1/fixture");
    expect(usageCollectionEnabled()).toBe(false);
  },
);
it("permits the production deployment only with both hosting markers", () => {
  vi.stubEnv("VERCEL_ENV", "production");
  expect(usageCollectionEnabled()).toBe(false);
  vi.stubEnv("VERCEL", "1");
  expect(usageCollectionEnabled()).toBe(true);
});
it.each(["localhost", "127.0.0.1", "[::1]"])(
  "requires explicit local opt-in for %s",
  (host) => {
    vi.stubEnv("DATABASE_URL", `postgresql://${host}/fixture`);
    expect(usageCollectionEnabled()).toBe(false);
    vi.stubEnv("KORZA_LOCAL_USAGE", "1");
    expect(usageCollectionEnabled()).toBe(true);
  },
);
it.each([
  "",
  "not a URL",
  "postgresql://database.example/production",
  "postgresql://127.0.0.1/",
  "https://127.0.0.1/fixture",
  "postgresql://localhost.attacker.example/fixture",
])("refuses local collection with database %s", (database) => {
  vi.stubEnv("KORZA_LOCAL_USAGE", "1");
  vi.stubEnv("DATABASE_URL", database);
  expect(usageCollectionEnabled()).toBe(false);
});

it("rejects a loopback-looking URL whose query changes pg's actual host", () => {
  const connectionString =
    "postgresql://127.0.0.1/fixture?host=production.example";
  // Constructing a client parses configuration without opening a connection.
  expect(new pg.Client({ connectionString }).host).toBe("production.example");
  vi.stubEnv("KORZA_LOCAL_USAGE", "1");
  vi.stubEnv("DATABASE_URL", connectionString);
  expect(usageCollectionEnabled()).toBe(false);
});
it("permits TLS and session options without allowing connection overrides", () => {
  vi.stubEnv("KORZA_LOCAL_USAGE", "1");
  vi.stubEnv(
    "DATABASE_URL",
    "postgresql://127.0.0.1/fixture?sslmode=verify-full&options=-c%20search_path%3Dfixture",
  );
  expect(usageCollectionEnabled()).toBe(true);
});
