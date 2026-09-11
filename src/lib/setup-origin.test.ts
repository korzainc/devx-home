import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSetupOrigin } from "./setup-origin";

beforeEach(() => {
  vi.stubEnv("VERCEL_URL", undefined);
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined);
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("PORT", undefined);
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => vi.unstubAllEnvs());

describe("installer origin", () => {
  it("uses the deployment URL in preview without borrowing production", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "preview.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "production.example");
    expect(getSetupOrigin()).toBe("https://preview.vercel.app");
  });

  it("uses the public production domain instead of a protected deployment URL", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_URL", "deployment.vercel.app");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "production.example");
    expect(getSetupOrigin()).toBe("https://production.example");
  });

  it("does not invent an origin when production is unconfigured", () => {
    expect(getSetupOrigin()).toBeNull();
  });

  it("defaults to the local development port only in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getSetupOrigin()).toBe("http://localhost:3000");
    vi.stubEnv("PORT", "4000");
    expect(getSetupOrigin()).toBe("http://localhost:4000");
  });

  it.each([
    "user:password@example.com",
    "example.com/path",
    "example.com?query=value",
    "example.com#fragment",
  ])("rejects an invalid deployment host %s", (host) => {
    vi.stubEnv("VERCEL_URL", host);
    expect(getSetupOrigin()).toBeNull();
  });
});
