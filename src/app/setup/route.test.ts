import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getSetup } from "./route";
import { artifactPaths } from "@/lib/setup-script";

// Next passes a request even when the handler does not consume it. Keep that
// invocation here to verify that hostile request headers cannot affect the URL.
const GET: (request: NextRequest) => Response = getSetup;

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_URL", "setup.example");
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /setup", () => {
  it("serves an uncached shell script pinned to the configured origin", async () => {
    const res = GET(new NextRequest("https://setup.example/setup"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/shellscript/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.text();
    expect(body).toMatch(/^#!\/bin\/sh\n/);
    expect(body).toContain(
      `KORZA_DIST_URL='https://setup.example${artifactPaths().tarball}'`,
    );
  });

  it("ignores both Host and forwarded headers when choosing download URLs", async () => {
    const body = await GET(
      new NextRequest("https://untrusted.example/setup", {
        headers: {
          host: "another.example",
          "x-forwarded-host": "untrusted.example",
          "x-forwarded-proto": "http",
        },
      }),
    ).text();
    expect(body).toContain(
      `KORZA_DIST_URL='https://setup.example${artifactPaths().tarball}'`,
    );
    expect(body).not.toContain("untrusted.example");
    expect(body).not.toContain("another.example");
  });

  it("pins the URL and digest before the installer's release lookup", async () => {
    const body = await GET(
      new NextRequest("https://setup.example/setup"),
    ).text();
    const lookup = body.indexOf("releases/latest");
    for (const name of ["KORZA_DIST_URL", "KORZA_DIST_SHA256"]) {
      const assignment = body.indexOf(`export ${name}=`);
      expect(assignment).toBeGreaterThan(-1);
      expect(assignment).toBeLessThan(lookup);
    }
  });

  it("supports explicitly configured local HTTP rehearsal", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_URL", undefined);
    vi.stubEnv("PORT", "4000");
    const body = await GET(
      new NextRequest("http://localhost:4000/setup"),
    ).text();
    expect(body).toContain(
      `KORZA_DIST_URL='http://localhost:4000${artifactPaths().tarball}'`,
    );
  });

  it("fails closed when the origin is not configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_URL", undefined);
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined);
    const res = GET(new NextRequest("https://untrusted.example/setup"));
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.text();
    expect(body).toContain("exit 1");
    expect(body).not.toContain("KORZA_DIST_URL=");
  });
});
