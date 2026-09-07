import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { artifactPaths } from "@/lib/setup-script";

describe("GET /setup", () => {
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

  it("carries no em dashes or en dashes", async () => {
    const res = GET(new NextRequest("http://localhost:3000/setup"));
    const body = await res.text();
    expect(body).not.toMatch(/[–—]/);
  });
});
