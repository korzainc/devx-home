import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSetupOrigin } from "./setup-origin";

beforeEach(() => {
  vi.stubEnv("DEVX_PUBLIC_ORIGIN", undefined);
  vi.stubEnv("VERCEL_URL", undefined);
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined);
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("PORT", undefined);
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => vi.unstubAllEnvs());

describe("installer origin", () => {
  it("prefers an explicit public origin over deployment defaults", () => {
    vi.stubEnv("DEVX_PUBLIC_ORIGIN", "https://setup.example/");
    vi.stubEnv("VERCEL_URL", "deployment.vercel.app");
    expect(getSetupOrigin()).toBe("https://setup.example");
  });

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
    "",
    "not-an-origin",
    "http://public.example",
    "http://localhost:3000",
    "https://user:password@example.com",
    "https://example.com/path",
    "https://example.com?query=value",
    "https://example.com#fragment",
  ])(
    "rejects invalid production configuration %s without falling back",
    (origin) => {
      vi.stubEnv("DEVX_PUBLIC_ORIGIN", origin);
      vi.stubEnv("VERCEL_URL", "valid.vercel.app");
      expect(getSetupOrigin()).toBeNull();
    },
  );

  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "permits explicit HTTP loopback %s for local development",
    (host) => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("DEVX_PUBLIC_ORIGIN", `http://${host}:4000`);
      expect(getSetupOrigin()).toBe(`http://${host}:4000`);
    },
  );
});
