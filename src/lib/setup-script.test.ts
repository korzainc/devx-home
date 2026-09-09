import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BUNDLED_ARCHIVE_NAME, RETAINED_ARCHIVE_NAMES } from "./artifact";
import { artifactPaths, setupScript } from "./setup-script";

const ARCHIVE_NAME = basename(artifactPaths().tarball);

// Retain tiny fixtures in the ignored workspace; no installer or archive runs.
function checksumFixture(contents?: string) {
  const parent = join(process.cwd(), ".claude", "setup-script-tests");
  mkdirSync(parent, { recursive: true });
  const root = mkdtempSync(join(parent, "case-"));
  const assets = join(root, "public", "korza");
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

  it("names and pins the real committed archive with its own digest", () => {
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
    // A saved installer script embeds a pin, so each bundle needs its own address rather than
    // one shared URL whose bytes move underneath it.
    expect(basename(paths.tarball)).toMatch(
      new RegExp(`-${digest.slice(0, 12)}\\.tar\\.gz$`),
    );

    const script = setupScript("https://preview.example");
    expect(script).toContain(
      `export KORZA_DIST_URL='https://preview.example${paths.tarball}'`,
    );
    expect(script).toContain(`export KORZA_DIST_SHA256='${digest}'`);
    expect(script.indexOf("export KORZA_DIST_SHA256=")).toBeLessThan(
      script.indexOf("set -eu"),
    );
  });

  it("validates every declared retained archive and its checksum sidecar", () => {
    for (const name of RETAINED_ARCHIVE_NAMES) {
      const archivePath = join(process.cwd(), "public", "korza", name);
      const digest = createHash("sha256")
        .update(readFileSync(archivePath))
        .digest("hex");
      expect(name).toMatch(new RegExp(`-${digest.slice(0, 12)}\\.tar\\.gz$`));
      expect(readFileSync(`${archivePath}.sha256`, "utf8")).toBe(
        `${digest}  ${name}\n`,
      );
    }
    expect(new Set(RETAINED_ARCHIVE_NAMES).size).toBe(
      RETAINED_ARCHIVE_NAMES.length,
    );
    expect(RETAINED_ARCHIVE_NAMES).not.toContain(BUNDLED_ARCHIVE_NAME);

    // Reconcile against the directory as well, so an archive that is committed but undeclared
    // cannot ship forever unnoticed. Only the previous release is retained, never a branch
    // rebuild, so the shipped set is exactly the bundle plus one.
    const shipped = readdirSync(join(process.cwd(), "public", "korza")).filter(
      (name) => name.endsWith(".tar.gz"),
    );
    expect(new Set(shipped)).toEqual(
      new Set([BUNDLED_ARCHIVE_NAME, ...RETAINED_ARCHIVE_NAMES]),
    );
    expect(RETAINED_ARCHIVE_NAMES).toHaveLength(1);
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
      "The bundled korza checksum is invalid.",
    );
  });
});
