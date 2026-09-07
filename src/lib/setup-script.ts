/**
 * The preview installer served at GET /setup.
 *
 * This is a standalone script for this Vercel preview, not a proxy for devx-cli's own
 * install.sh. It fetches the tarball and checksum from this same deployment's own
 * `/devx/` assets rather than a GitHub release or "latest" lookup, so a reviewer's
 * clean-VM run is pinned to exactly the build this PR shipped.
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

/** The POSIX shell installer, with every download URL pinned to `origin`. */
export function setupScript(origin: string): string {
  const { tarball, checksum } = artifactPaths();
  const tarballUrl = `${origin}${tarball}`;
  const checksumUrl = `${origin}${checksum}`;

  return `#!/bin/sh
# devx preview installer (${PREVIEW_ARTIFACT_VERSION}), testing only.
#
# Pinned to this Vercel preview's own build, not a GitHub release or "latest":
#   ${tarballUrl}
# Ad-hoc signed, not notarized.
set -eu

case "$(uname -s)" in
  Darwin) ;;
  *) printf 'devx supports macOS only for now.\\n' >&2; exit 1 ;;
esac

BIN_DIR="\$HOME/.local/bin"
TMP="\$(mktemp -d)"
trap 'rm -rf "\$TMP"' EXIT

printf 'Downloading devx (preview build)...\\n'
if ! curl -fsSL '${tarballUrl}' -o "\$TMP/devx.tar.gz"; then
  printf '\\nCould not download the preview build.\\n  ${tarballUrl}\\n' >&2
  exit 1
fi

if ! curl -fsSL '${checksumUrl}' -o "\$TMP/devx.sha256"; then
  printf '\\nCould not download the checksum file.\\n  ${checksumUrl}\\n' >&2
  exit 1
fi

printf 'Verifying the download...\\n'
WANT="\$(cut -d' ' -f1 < "\$TMP/devx.sha256")"
GOT="\$(shasum -a 256 "\$TMP/devx.tar.gz" | cut -d' ' -f1)"
if [ -z "\$WANT" ] || [ "\$WANT" != "\$GOT" ]; then
  printf '\\nThe download does not match its published checksum.\\n  expected %s\\n  got      %s\\nNothing was installed.\\n' "\$WANT" "\$GOT" >&2
  exit 1
fi

if ! tar -xzf "\$TMP/devx.tar.gz" -C "\$TMP"; then
  printf '\\nCould not extract the downloaded archive.\\nNothing was installed.\\n' >&2
  exit 1
fi

# tar happily creates a symlink named devx, and chmod follows symlinks, so an
# archive could otherwise change the mode of any file the running user owns.
if [ -L "\$TMP/devx" ] || [ ! -f "\$TMP/devx" ]; then
  printf '\\nThe archive did not contain a devx executable.\\nNothing was installed.\\n' >&2
  exit 1
fi

chmod 755 "\$TMP/devx"

# Prove the staged binary actually runs before touching anything that exists
# already: the current \$BIN_DIR/devx, if any, is untouched until this passes.
if ! "\$TMP/devx" --version >/dev/null 2>&1; then
  printf '\\nThe downloaded devx could not report its version.\\nNothing was installed.\\n' >&2
  exit 1
fi

mkdir -p "\$BIN_DIR"
if ! mv "\$TMP/devx" "\$BIN_DIR/devx"; then
  printf '\\nCould not install devx to %s.\\nNothing was changed.\\n' "\$BIN_DIR" >&2
  exit 1
fi

printf 'devx installed to %s\\n' "\$BIN_DIR/devx"

# One managed block in ~/.zshrc, clearly marked, so \$BIN_DIR is on PATH. A repeat
# run replaces the block rather than appending a second one.
ZSHRC="\$HOME/.zshrc"
BEGIN='# >>> devx >>>'
END='# <<< devx <<<'
touch "\$ZSHRC"
if grep -qF "\$BEGIN" "\$ZSHRC" 2>/dev/null; then
  awk -v b="\$BEGIN" -v e="\$END" '
    \$0==b {skip=1}
    skip==0 {print}
    \$0==e {skip=0}
  ' "\$ZSHRC" > "\$ZSHRC.devx-tmp" && mv "\$ZSHRC.devx-tmp" "\$ZSHRC"
fi
{
  printf '%s\\n' "\$BEGIN"
  printf 'export PATH="\$HOME/.local/bin:\$PATH"\\n'
  printf '%s\\n' "\$END"
} >> "\$ZSHRC"

printf '\\nOpen a new terminal (or run: source ~/.zshrc) so %s is on PATH.\\n\\n' "\$BIN_DIR" >&2
"\$BIN_DIR/devx" version
`;
}
