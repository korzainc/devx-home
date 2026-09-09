import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shellQuote } from "@/lib/shell-quote";

// Serve the vendored installer with this deployment's interim bundled distribution,
// including in production. DX-161 replaces this distribution path.
// Reconcile installer fixes with korza-cli when updating the script, archive and checksum.

/** Bump this alongside the files committed under public/korza/. */
export const BUNDLED_ARTIFACT_VERSION = "0.1.0";
const TARBALL_NAME = `korza-${BUNDLED_ARTIFACT_VERSION}-macos.tar.gz`;

export function artifactPaths() {
  return {
    tarball: `/korza/${TARBALL_NAME}`,
    checksum: `/korza/${TARBALL_NAME}.sha256`,
  };
}

function canonicalInstallScript(): string {
  return readFileSync(
    join(process.cwd(), "public", "korza", "install.sh"),
    "utf8",
  );
}

function bundledChecksum(): string {
  const [digest, filename, ...extra] = readFileSync(
    join(process.cwd(), "public", "korza", `${TARBALL_NAME}.sha256`),
    "utf8",
  )
    .trim()
    .split(/\s+/);
  if (
    !/^[0-9a-fA-F]{64}$/.test(digest) ||
    filename !== TARBALL_NAME ||
    extra.length !== 0
  ) {
    throw new Error("The bundled korza checksum is invalid.");
  }
  return digest.toLowerCase();
}

/** Pin the installer to this deployment's bundled artifact. */
export function setupScript(origin: string): string {
  const script = canonicalInstallScript();
  const tarballUrl = `${origin}${artifactPaths().tarball}`;
  const digest = bundledChecksum();
  const [shebang, ...rest] = script.split("\n");

  const override = [
    "",
    "# Use this deployment's bundled artifact.",
    `export KORZA_DIST_URL=${shellQuote(tarballUrl)}`,
    `export KORZA_DIST_SHA256=${shellQuote(digest)}`,
  ];

  return [shebang, ...override, ...rest].join("\n");
}
