import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { artifactPaths } from "@/lib/setup-script";

describe("GET /setup", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves a shell script, not HTML or JSON", async () => {
    const res = GET(new NextRequest("http://localhost:3000/setup"));
    expect(res.headers.get("Content-Type")).toMatch(/shellscript/);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.text();
    expect(body).toMatch(/^#!\/bin\/sh/);
  });

  it("is devx-cli's own install.sh, not a second implementation", async () => {
    const res = GET(new NextRequest("http://localhost:3000/setup"));
    const body = await res.text();
    // Lines lifted straight from the canonical script: its own R1 comment,
    // its symlink guard, and its codesign fallback. A hand-rolled preview
    // script would not carry these unless it duplicated them by hand.
    expect(body).toMatch(/the one paste-able command \(PRD R1\)/);
    expect(body).toMatch(/tar happily creates a symlink/);
    expect(body).toMatch(/codesign --force --sign -/);
  });

  it("pins the download URLs to the request's own origin, not a fixed host", async () => {
    const res = GET(
      new NextRequest("https://devx-home-git-pr-39.vercel.app/setup"),
    );
    const body = await res.text();
    const { tarball } = artifactPaths();
    expect(body).toContain(
      `DEVX_DIST_URL='https://devx-home-git-pr-39.vercel.app${tarball}'`,
    );
  });

  it("trusts x-forwarded-host/proto over nextUrl behind a reverse proxy", async () => {
    // Caught via a real ngrok tunnel: request.nextUrl.origin reported
    // "https://localhost:3000" even with a correct, present
    // x-forwarded-host/proto pair, since nextUrl reflects the server's own
    // bind address rather than what a proxy actually forwarded. Vercel's
    // edge sets the same two headers, so this is the real preview path too.
    const res = GET(
      new NextRequest("http://localhost:3000/setup", {
        headers: {
          host: "localhost:3000",
          "x-forwarded-host": "abcd1234.ngrok-free.app",
          "x-forwarded-proto": "https",
        },
      }),
    );
    const body = await res.text();
    const { tarball } = artifactPaths();
    expect(body).toContain(`https://abcd1234.ngrok-free.app${tarball}`);
    expect(body).not.toContain("localhost:3000");
  });

  it("works the same way for a local dev origin", async () => {
    const res = GET(new NextRequest("http://localhost:3000/setup"));
    const body = await res.text();
    expect(body).toContain("http://localhost:3000/devx/");
  });

  it("sets DEVX_DIST_URL before the script's own latest-release lookup, so preview never reaches it", async () => {
    const res = GET(new NextRequest("http://localhost:3000/setup"));
    const body = await res.text();
    const overrideAt = body.indexOf("export DEVX_DIST_URL=");
    const lookupAt = body.indexOf("releases/latest");
    expect(overrideAt).toBeGreaterThan(-1);
    expect(lookupAt).toBeGreaterThan(-1);
    expect(overrideAt).toBeLessThan(lookupAt);
  });

  it("does not point at the production domain", async () => {
    const res = GET(new NextRequest("http://localhost:3000/setup"));
    const body = await res.text();
    // The canonical script's own header comment names the production
    // command as documentation; DEVX_DIST_URL is what actually runs.
    expect(body).not.toMatch(/DEVX_DIST_URL=.*devx\.korza\.ai/);
  });

  it("verifies the checksum before extracting, and fails loudly on mismatch", async () => {
    const res = GET(new NextRequest("http://localhost:3000/setup"));
    const body = await res.text();
    expect(body).toMatch(/shasum -a 256/);
    expect(body).toMatch(/does not match its published checksum/);
    expect(body).toMatch(/set -eu/);
  });

  it("only installs after the staged binary proves it can run", async () => {
    const res = GET(new NextRequest("http://localhost:3000/setup"));
    const body = await res.text();
    const versionCheck = body.indexOf("--version");
    const move = body.indexOf('mv "$TMP/devx"');
    expect(versionCheck).toBeGreaterThan(-1);
    expect(move).toBeGreaterThan(versionCheck);
  });

  it("prints the next setup command after installing", async () => {
    const res = GET(new NextRequest("http://localhost:3000/setup"));
    const body = await res.text();
    expect(body).toContain("Start setup:");
    expect(body).toContain("devx setup");
    expect(body).not.toContain('exec \"$BIN_DIR/devx\" setup');
  });

  it("keeps http when an unproxied dev server sends host but no x-forwarded-proto", async () => {
    // A real `next dev` server always sends a host header (HTTP/1.1 requires
    // one) and never sends x-forwarded-proto, since nothing is proxying it.
    // Defaulting to https there pins DEVX_DIST_URL to a scheme the dev server
    // does not serve, so the script's own curl fails mid-rehearsal. A bare
    // NextRequest carries no host header, which is why the other local-origin
    // test above does not catch this.
    const res = GET(
      new NextRequest("http://localhost:3000/setup", {
        headers: { host: "localhost:3000" },
      }),
    );
    const body = await res.text();
    const { tarball } = artifactPaths();
    expect(body).toContain(`DEVX_DIST_URL='http://localhost:3000${tarball}'`);
    expect(body).not.toContain("https://localhost:3000");
  });

  it("quotes a hostile forwarded host into a single literal shell word", async () => {
    const res = GET(
      new NextRequest("https://example.com/setup", {
        headers: {
          "x-forwarded-host": "evil.example'; echo pwned #",
          "x-forwarded-proto": "https",
        },
      }),
    );
    const body = await res.text();
    const line = body
      .split("\n")
      .find((l) => l.startsWith("export DEVX_DIST_URL="));
    expect(line).toBeDefined();
    const { tarball } = artifactPaths();
    // Single-quoted, with the embedded quote closed and reopened as '\'' so a
    // POSIX shell reads the whole value as one word rather than a command.
    expect(line).toBe(
      "export DEVX_DIST_URL='https://evil.example'\\''; echo pwned #" +
        tarball +
        "'",
    );
    // Exactly one assignment line, so nothing broke out onto its own.
    expect(
      body.split("\n").filter((l) => l.startsWith("export DEVX_DIST_URL=")),
    ).toHaveLength(1);
  });

  it("pins production to its own committed artifact too, not to a release", async () => {
    // Deliberate for now, not an oversight. devx-cli publishes no releases, so
    // dropping the override in production would send every real install into
    // the script's releases/latest lookup and fail with "Could not find a macOS
    // build of devx". Pointing production at a verified release should be a
    // conscious change, and one that breaks this test.
    vi.stubEnv("VERCEL_ENV", "production");
    const res = GET(new NextRequest("https://devx.korza.ai/setup"));
    const body = await res.text();
    const { tarball } = artifactPaths();
    expect(body).toContain(`DEVX_DIST_URL='https://devx.korza.ai${tarball}'`);
  });

  it("carries no em dashes or en dashes", async () => {
    const res = GET(new NextRequest("http://localhost:3000/setup"));
    const body = await res.text();
    expect(body).not.toMatch(/[–—]/);
  });
});
