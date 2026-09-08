import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { artifactPaths, setupScript } from "./setup-script";

const ARCHIVE_NAME = basename(artifactPaths().tarball);

// Retain tiny fixtures in the ignored workspace; no installer or archive runs.
function checksumFixture(contents?: string) {
  const parent = join(process.cwd(), ".claude", "setup-script-tests");
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, "case-"));
  const assets = join(root, "public", "devx");
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, "install.sh"), "#!/bin/sh\nset -eu\n");
  if (contents !== undefined) {
    writeFileSync(join(assets, basename(artifactPaths().checksum)), contents);
  }
  vi.spyOn(process, "cwd").mockReturnValue(root);
}

describe("bundled setup artifact", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("embeds the digest of the real committed archive and matching sidecar", () => {
    const paths = artifactPaths();
    const archivePath = join(process.cwd(), "public", paths.tarball);
    const sidecarPath = join(process.cwd(), "public", paths.checksum);
    expect(statSync(archivePath).isFile()).toBe(true);
    expect(statSync(sidecarPath).isFile()).toBe(true);
    const digest = createHash("sha256")
      .update(readFileSync(archivePath))
      .digest("hex");
    expect(readFileSync(sidecarPath, "utf8")).toBe(
      `${digest}  ${basename(paths.tarball)}\n`,
    );

    const script = setupScript("https://preview.example");
    expect(script).toContain(
      `export DEVX_DIST_URL='https://preview.example${paths.tarball}'`,
    );
    expect(script).toContain(`export DEVX_DIST_SHA256='${digest}'`);
    expect(script.indexOf("export DEVX_DIST_SHA256=")).toBeLessThan(
      script.indexOf("set -eu"),
    );
  });

  it("does not generate an installer when the committed sidecar is missing", () => {
    checksumFixture();
    expect(() => setupScript("https://preview.example")).toThrow("ENOENT");
  });

  it.each([
    ["empty", ""],
    ["short digest", `${"0".repeat(63)}  ${ARCHIVE_NAME}\n`],
    ["non-hex digest", `${"g".repeat(64)}  ${ARCHIVE_NAME}\n`],
    ["missing filename", `${"0".repeat(64)}\n`],
    ["different filename", `${"0".repeat(64)}  another.tar.gz\n`],
    ["extra entry", `${"0".repeat(64)}  ${ARCHIVE_NAME}\nextra\n`],
  ])("rejects a committed sidecar with %s", (_label, contents) => {
    checksumFixture(contents);
    expect(() => setupScript("https://preview.example")).toThrow(
      "The bundled devx checksum is invalid.",
    );
  });
});
