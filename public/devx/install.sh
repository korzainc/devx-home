#!/bin/sh
# devx installer: the one paste-able command (PRD R1).
#
# Deployment must provide a verified public HTTPS /setup URL.
# No production installer hostname is configured in this repository.
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
  # Capture HTTP status separately so a rate limit is not reported as a missing release.
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

# The same-origin digest detects corruption, not a compromised release host.
# It also applies to DEVX_DIST_URL. shasum ships with macOS.
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

# Sign unsigned arm64 binaries before probing; the kernel refuses to run them.
# Never replace an invalid Developer ID signature with an ad-hoc one.
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

# Verify the staged executable can run before replacing an existing install.
if ! "$TMP/devx" --version >/dev/null 2>&1; then
  printf '\n  The downloaded devx could not report its version.\n' >&2
  printf '  Nothing was installed.\n' >&2
  exit 1
fi

mkdir -p "$BIN_DIR"

# Reject directories because mv would nest the executable inside and still exit 0.
if [ -e "$BIN_DIR/devx" ] && [ ! -f "$BIN_DIR/devx" ]; then
  printf '\n  %s exists and is not a regular file.\n' "$BIN_DIR/devx" >&2
  printf '  Remove it, then run this again. Nothing was installed.\n' >&2
  exit 1
fi

mv "$TMP/devx" "$BIN_DIR/devx"

# Print a literal shell word, including paths with spaces or apostrophes.
print_shell_word() {
  quote_rest=$1
  printf '%s' "'"
  while :; do
    case "$quote_rest" in
      *"'"*)
        printf '%s%s' "${quote_rest%%"'"*}" "'\\''"
        quote_rest=${quote_rest#*"'"}
        ;;
      *)
        printf '%s%s' "$quote_rest" "'"
        break
        ;;
    esac
  done
}

printf '\n  devx installed to %s\n\n' "$BIN_DIR/devx"
printf '  Start setup:\n    '
print_shell_word "$BIN_DIR/devx"
printf ' setup\n\n'
printf '  Help:\n    '
print_shell_word "$BIN_DIR/devx"
printf ' --help\n'
