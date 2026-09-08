#!/bin/sh
# devx installer: the one paste-able command (PRD R1).
#
#   curl -fsSL https://devx.korza.ai/setup | sh
#
# It must work on a Mac with no developer tools, so it uses only what
# macOS ships: sh, curl, tar, mktemp. No Homebrew, no Xcode, no sudo.
set -eu

REPO="${DEVX_REPO:-korzainc/devx-cli}"
# $HOME is only needed for the default. Under `set -u` a bare $HOME would abort
# with a raw "parameter not set" instead of one of this script's own messages.
if [ -z "${DEVX_BIN_DIR:-}" ] && [ -z "${HOME:-}" ]; then
  printf '  Set DEVX_BIN_DIR or HOME to choose where devx is installed.\n' >&2
  exit 1
fi
BIN_DIR="${DEVX_BIN_DIR:-$HOME/.local/bin}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

case "$(uname -s)" in
  Darwin) ;;
  *) printf '  devx supports macOS only for now.\n' >&2; exit 1 ;;
esac

# DEVX_DIST_URL points the installer at a local tarball, so the whole
# entry path can be rehearsed before anything is published.
if [ -n "${DEVX_DIST_URL:-}" ]; then
  URL="$DEVX_DIST_URL"
else
  printf '  Finding the latest devx release…\n'
  # POSIX sh has no pipefail, so a pipeline's status comes from its last stage:
  # a failed curl here would read as an empty URL and be reported below as "no
  # macOS build", which is wrong and sends people to look at the releases page.
  # Capture the response and its status separately so a rate limit says so.
  STATUS="$(curl -fsSL -o "$TMP/release.json" -w '%{http_code}' \
    "https://api.github.com/repos/$REPO/releases/latest" || true)"
  case "$STATUS" in
    403|429)
      printf '\n  GitHub is rate-limiting this network (HTTP %s).\n' "$STATUS" >&2
      printf '  Wait a few minutes and run this again, or ask in #devx.\n' >&2
      exit 1
      ;;
  esac
  URL="$(grep -o '"browser_download_url": *"[^"]*macos\.tar\.gz"' "$TMP/release.json" 2>/dev/null \
    | grep -v -e 'arm64' -e 'amd64' \
    | grep -v '\.sha256' \
    | head -1 \
    | sed 's/.*"\(https[^"]*\)"/\1/')"
fi

if [ -z "$URL" ]; then
  printf '  Could not find a macOS build of devx.\n' >&2
  printf '  See https://github.com/%s/releases\n' "$REPO" >&2
  exit 1
fi

printf '  Downloading devx…\n'
curl -fsSL "$URL" -o "$TMP/devx.tar.gz"

# Verify the download against the digest published beside it.
#
# Be clear about what this does and does not buy. The digest comes from the
# same origin as the payload, so anyone who can serve you a hostile tarball
# can serve a matching .sha256 with it. This is NOT protection against
# someone who controls the connection or the release host.
#
# What it does catch: a truncated or corrupted download, a CDN edge that
# serves a stale or partial object, and a release asset replaced without
# its digest being regenerated. Those are the failures that actually happen.
#
# Real protection needs a signature made with a key that never touches the
# release host. Until signed releases are available, this script should not
# pretend to provide that stronger guarantee.
#
# shasum is part of macOS, so this needs no developer tools (R1).
#
# This applies to DEVX_DIST_URL too. A rehearsal that skips the check is
# not a rehearsal of this script, and build.sh writes a .sha256 next to
# every tarball it produces, so there is nothing to exempt.
printf '  Verifying the download…\n'
if ! curl -fsSL "$URL.sha256" -o "$TMP/devx.sha256"; then
  printf '\n  This release publishes no checksum, so devx will not install it.\n' >&2
  printf '  See https://github.com/%s/releases\n' "$REPO" >&2
  exit 1
fi
WANT="$(cut -d" " -f1 < "$TMP/devx.sha256")"
GOT="$(shasum -a 256 "$TMP/devx.tar.gz" | cut -d" " -f1)"
if [ "$WANT" != "$GOT" ]; then
  printf '\n  The download does not match its published checksum.\n' >&2
  printf '  Expected %s\n  Received %s\n' "$WANT" "$GOT" >&2
  printf '  Nothing was installed.\n' >&2
  exit 1
fi

# The release may be a tarball or a bare binary; accept either.
if tar -tzf "$TMP/devx.tar.gz" >/dev/null 2>&1; then
  tar -xzf "$TMP/devx.tar.gz" -C "$TMP"
else
  mv "$TMP/devx.tar.gz" "$TMP/devx"
fi

# The extracted entry must be a real file. tar happily creates a symlink
# named devx, and chmod follows symlinks, so an archive could otherwise
# change the mode of any file the running user owns.
if [ -L "$TMP/devx" ] || [ ! -f "$TMP/devx" ]; then
  printf '\n  The archive did not contain a devx executable.\n' >&2
  printf '  Nothing was installed.\n' >&2
  exit 1
fi

chmod 755 "$TMP/devx"

# The kernel refuses to launch an unsigned arm64 binary, so a signature is
# required. An invalid Developer ID signature is a release error, not a
# reason to overwrite it with an ad-hoc one and falsely make it look valid.
#
# This has to run before the --version probe below. On Apple Silicon an
# unsigned binary is killed on exec, so probing first would fail exactly the
# release this ad-hoc signing exists to rescue, and would exit before ever
# reaching it.
if ! codesign --verify --strict "$TMP/devx" 2>/dev/null; then
  if codesign -dvv "$TMP/devx" 2>&1 | grep -q 'Authority=Developer ID'; then
    printf '\n  The release has an invalid Developer ID signature.\n' >&2
    printf '  Nothing was installed.\n' >&2
    exit 1
  fi
  if ! codesign --force --sign - "$TMP/devx" 2>/dev/null; then
    printf '\n  devx could not be signed for this Mac.\n' >&2
    printf '  Nothing was installed.\n' >&2
    exit 1
  fi
fi

# Prove the staged program is a devx executable before changing the command
# already on PATH. A checksum proves transport integrity; this catches a
# mispackaged release or an archive whose `devx` entry cannot actually run.
if ! "$TMP/devx" --version >/dev/null 2>&1; then
  printf '\n  The downloaded devx could not report its version.\n' >&2
  printf '  Nothing was installed.\n' >&2
  exit 1
fi

mkdir -p "$BIN_DIR"

# mv moves its source into a directory destination instead of replacing it, so
# an existing directory at $BIN_DIR/devx would leave $BIN_DIR/devx/devx behind
# and still exit 0. Every other failure here installs nothing and says so; this
# path must not be the one that claims success having installed nothing.
if [ -e "$BIN_DIR/devx" ] && [ ! -f "$BIN_DIR/devx" ]; then
  printf '\n  %s exists and is not a regular file.\n' "$BIN_DIR/devx" >&2
  printf '  Remove it, then run this again. Nothing was installed.\n' >&2
  exit 1
fi

mv "$TMP/devx" "$BIN_DIR/devx"

printf '\n  devx installed to %s\n\n' "$BIN_DIR/devx"
printf '  Start setup:\n'
printf '    %s setup\n\n' "$BIN_DIR/devx"
printf '  Or open a new terminal, then run:\n'
printf '    devx setup\n\n'
printf '  Help:\n'
printf '    devx --help\n'
