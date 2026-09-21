import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { artifactPaths, BUNDLED_ARTIFACT_VERSION } from "@/lib/setup-script";
import { GET } from "./route";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "devx.example");
  vi.stubEnv("VERCEL_URL", "preview.example");
});
afterEach(() => vi.unstubAllEnvs());

it("advertises only the current bundle using the updater contract", async () => {
  const response = GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual({
    version: BUNDLED_ARTIFACT_VERSION,
    url: `https://devx.example${artifactPaths().tarball}`,
    sum_url: `https://devx.example${artifactPaths().checksum}`,
    notes: "Bundled macOS candidate. Ad-hoc signed; not notarized.",
  });
});

it("keeps preview downloads on their own deployment", async () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  expect((await GET().json()).url).toBe(
    `https://preview.example${artifactPaths().tarball}`,
  );
});

it("fails closed without a trusted deployment origin", async () => {
  vi.stubEnv("VERCEL_URL", undefined);
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined);
  const response = GET();
  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).not.toHaveProperty("version");
});
