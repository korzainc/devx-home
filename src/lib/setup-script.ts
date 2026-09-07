import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The installer served at GET /setup. This is devx-cli's own install.sh, vendored under
 * public/devx/ and re-served verbatim behind one override line, rather than a second,
 * hand-written implementation of the same download/verify/install logic. Two copies of that
 * logic meant every future fix (a path bug, a security tightening) had to be remembered twice;
 * this way there is exactly one script to fix.
 *
 * The override is install.sh's own existing hook (see its own comment: "DEVX_DIST_URL points
 * the installer at a local tarball, so the whole entry path can be rehearsed before anything is
 * published") pointed at this deployment's own /devx/ assets, so a preview never reaches for a
 * GitHub release or "latest". Production drops the override and gets the same script's default
 * behavior unchanged.
 *
 * Keep public/devx/install.sh in sync with devx-cli/install.sh by hand, the same way the
 * tarball under public/devx/ is kept in sync with a devx-cli build.
 */

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

/** The canonical devx-cli installer, pinned to this deployment's own artifact via DEVX_DIST_URL. */
export function setupScript(origin: string): string {
  const tarballUrl = `${origin}${artifactPaths().tarball}`;
  const script = canonicalInstallScript();
  const [shebang, ...rest] = script.split("\n");

  const override = [
    "",
    `# Preview override: this deployment's own build, not a GitHub release or "latest".`,
    `export DEVX_DIST_URL=${shellQuote(tarballUrl)}`,
  ];

  return [shebang, ...override, ...rest].join("\n");
}

/** Wraps a value so a POSIX shell reads it as one literal word. */
function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", `'\\''`) + "'";
}
