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

  it("pins the download URLs to the request's own origin, not a fixed host", async () => {
    const res = GET(
      new NextRequest("https://devx-home-git-pr-39.vercel.app/setup"),
    );
    const body = await res.text();
    const { tarball, checksum } = artifactPaths();
    expect(body).toContain(`https://devx-home-git-pr-39.vercel.app${tarball}`);
    expect(body).toContain(`https://devx-home-git-pr-39.vercel.app${checksum}`);
  });

  it("works the same way for a local dev origin", async () => {
    const res = GET(new NextRequest("http://localhost:3000/setup"));
    const body = await res.text();
    expect(body).toContain("http://localhost:3000/devx/");
  });

  it("never reaches for a GitHub release, a production domain, or 'latest'", async () => {
    const res = GET(new NextRequest("http://localhost:3000/setup"));
    const body = await res.text();
    expect(body).not.toMatch(/github\.com/);
    expect(body).not.toMatch(/devx\.korza\.ai/);
    expect(body).not.toMatch(/releases\/latest/);
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

  it("manages PATH through one clearly marked ~/.zshrc block", async () => {
    const res = GET(new NextRequest("http://localhost:3000/setup"));
    const body = await res.text();
    expect(body).toContain("# >>> devx >>>");
    expect(body).toContain("# <<< devx <<<");
    expect(body).toContain('export PATH="$HOME/.local/bin:$PATH"');
  });

  it("hands off into the wizard, for an actual onboarding review", async () => {
    const res = GET(new NextRequest("http://localhost:3000/setup"));
    const body = await res.text();
    expect(body.trim().endsWith('exec "$BIN_DIR/devx" setup')).toBe(true);
  });

  it("carries no em dashes or en dashes in its own comments", async () => {
    const res = GET(new NextRequest("http://localhost:3000/setup"));
    const body = await res.text();
    expect(body).not.toMatch(/[–—]/);
  });
});
