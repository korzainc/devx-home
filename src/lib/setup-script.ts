import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shellQuote } from "@/lib/shell-quote";

// Serve the vendored installer with this deployment's bundled prerelease, including
// in production. Moving to published releases requires an explicit distribution change.
// Reconcile installer fixes with devx-cli when updating the script, archive and checksum.

/** Bump this alongside the files committed under public/devx/. */
export const PREVIEW_ARTIFACT_VERSION = "0.1.0";
const TARBALL_NAME = `devx-${PREVIEW_ARTIFACT_VERSION}-macos.tar.gz`;

export function artifactPaths() {
  return {
    tarball: `/devx/${TARBALL_NAME}`,
    checksum: `/devx/${TARBALL_NAME}.sha256`,
  };
}

function canonicalInstallScript(): string {
  return readFileSync(
    join(process.cwd(), "public", "devx", "install.sh"),
    "utf8",
  );
}

/** Pin the installer to this deployment's bundled artifact. */
export function setupScript(origin: string): string {
  const script = canonicalInstallScript();
  const tarballUrl = `${origin}${artifactPaths().tarball}`;
  const [shebang, ...rest] = script.split("\n");

  const override = [
    "",
    "# Use this deployment's bundled artifact.",
    `export DEVX_DIST_URL=${shellQuote(tarballUrl)}`,
  ];

  return [shebang, ...override, ...rest].join("\n");
}
