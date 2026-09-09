#!/bin/sh
# korza installer: the one paste-able command (PRD R1).
#
# Deployment must provide a verified public HTTPS /setup URL.
# No production installer hostname is configured in this repository.
#
# It must work on a Mac with no developer tools, so it uses only what
# macOS ships: sh, curl, tar, mktemp. No Homebrew, no Xcode, no sudo.
set -eu

# Legacy names are accepted only when the Korza name is unset.
if [ "${KORZA_REPO+x}" != x ] && [ "${DEVX_REPO+x}" = x ]; then
  KORZA_REPO=$DEVX_REPO
fi
if [ "${KORZA_BIN_DIR+x}" != x ] && [ "${DEVX_BIN_DIR+x}" = x ]; then
  KORZA_BIN_DIR=$DEVX_BIN_DIR
fi
if [ "${KORZA_DIST_URL+x}" != x ] && [ "${DEVX_DIST_URL+x}" = x ]; then
  KORZA_DIST_URL=$DEVX_DIST_URL
fi
if [ "${KORZA_DIST_SHA256+x}" != x ] && [ "${DEVX_DIST_SHA256+x}" = x ]; then
  KORZA_DIST_SHA256=$DEVX_DIST_SHA256
fi

REPO="${KORZA_REPO:-korzainc/devx-cli}"
# $HOME is only needed for the default. Under `set -u` a bare $HOME would abort
# with a raw "parameter not set" instead of one of this script's own messages.
if [ -z "${KORZA_BIN_DIR:-}" ] && [ -z "${HOME:-}" ]; then
  printf '  Set KORZA_BIN_DIR or HOME to choose where korza is installed.\n' >&2
  exit 1
fi
BIN_DIR="${KORZA_BIN_DIR:-$HOME/.local/bin}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

case "$(uname -s)" in
  Darwin) ;;
  *) printf '  korza supports macOS only for now.\n' >&2; exit 1 ;;
esac

# KORZA_DIST_URL points the installer at a local tarball, so the whole
# entry path can be rehearsed before anything is published.
if [ -n "${KORZA_DIST_URL:-}" ]; then
  URL="$KORZA_DIST_URL"
else
  printf '  Finding the latest korza release…\n'
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
  printf '  Could not find a macOS build of korza.\n' >&2
  printf '  See https://github.com/%s/releases\n' "$REPO" >&2
  exit 1
fi

printf '  Downloading korza…\n'
curl -fsSL "$URL" -o "$TMP/korza.tar.gz"

# /setup embeds the committed digest. Direct installs use the published sidecar.
# Neither protects against a compromised script server. shasum ships with macOS.
printf '  Verifying the download…\n'
if [ "${KORZA_DIST_SHA256+x}" = x ]; then
  WANT="$KORZA_DIST_SHA256"
else
  if ! curl -fsSL "$URL.sha256" -o "$TMP/korza.sha256"; then
    printf '\n  This release publishes no checksum, so korza will not install it.\n' >&2
    printf '  See https://github.com/%s/releases\n' "$REPO" >&2
    exit 1
  fi
  WANT="$(cut -d" " -f1 < "$TMP/korza.sha256")"
fi
if [ "${#WANT}" -ne 64 ] || ! printf '%s\n' "$WANT" | grep -Eq '^[0-9a-fA-F]{64}$'; then
  printf '\n  The expected checksum must be exactly 64 hexadecimal characters.\n' >&2
  printf '  Nothing was installed.\n' >&2
  exit 1
fi
WANT="$(printf '%s' "$WANT" | tr 'A-F' 'a-f')"
GOT="$(shasum -a 256 "$TMP/korza.tar.gz" | cut -d" " -f1)"
if [ "$WANT" != "$GOT" ]; then
  printf '\n  The download does not match its published checksum.\n' >&2
  printf '  Expected %s\n  Received %s\n' "$WANT" "$GOT" >&2
  printf '  Nothing was installed.\n' >&2
  exit 1
fi

# The release may be a tarball or a bare binary; accept either.
if tar -tzf "$TMP/korza.tar.gz" >/dev/null 2>&1; then
  tar -xzf "$TMP/korza.tar.gz" -C "$TMP"
else
  mv "$TMP/korza.tar.gz" "$TMP/korza"
fi

# The extracted entry must be a real file. tar happily creates a symlink
# named korza, and chmod follows symlinks, so an archive could otherwise
# change the mode of any file the running user owns.
if [ -L "$TMP/korza" ] || [ ! -f "$TMP/korza" ]; then
  printf '\n  The archive did not contain a korza executable.\n' >&2
  printf '  Nothing was installed.\n' >&2
  exit 1
fi

chmod 755 "$TMP/korza"

# Sign unsigned arm64 binaries before probing; the kernel refuses to run them.
# Never replace an invalid Developer ID signature with an ad-hoc one.
if ! codesign --verify --strict "$TMP/korza" 2>/dev/null; then
  if codesign -dvv "$TMP/korza" 2>&1 | grep -q 'Authority=Developer ID'; then
    printf '\n  The release has an invalid Developer ID signature.\n' >&2
    printf '  Nothing was installed.\n' >&2
    exit 1
  fi
  if ! codesign --force --sign - "$TMP/korza" 2>/dev/null; then
    printf '\n  korza could not be signed for this Mac.\n' >&2
    printf '  Nothing was installed.\n' >&2
    exit 1
  fi
fi

# Verify the staged executable can run before replacing an existing install.
if ! "$TMP/korza" --version >/dev/null 2>&1; then
  printf '\n  The downloaded korza could not report its version.\n' >&2
  printf '  Nothing was installed.\n' >&2
  exit 1
fi

mkdir -p "$BIN_DIR"

# Reject directories because mv would nest the executable inside and still exit 0.
if [ -e "$BIN_DIR/korza" ] && [ ! -f "$BIN_DIR/korza" ]; then
  printf '\n  %s exists and is not a regular file.\n' "$BIN_DIR/korza" >&2
  printf '  Remove it, then run this again. Nothing was installed.\n' >&2
  exit 1
fi

mv "$TMP/korza" "$BIN_DIR/korza"
if [ ! -e "$BIN_DIR/kz" ] && [ ! -L "$BIN_DIR/kz" ]; then ln -s korza "$BIN_DIR/kz"; fi

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

# Use the short command only when PATH selects the executable just installed.
# Otherwise keep a quoted path so first installs and older PATH entries work.
if [ "$(command -v korza || true)" = "$BIN_DIR/korza" ]; then
  KORZA_COMMAND=korza
else
  KORZA_COMMAND=$(print_shell_word "$BIN_DIR/korza")
fi

printf '\n  korza installed to %s\n\n' "$BIN_DIR/korza"
printf '  Start setup:\n    %s setup\n\n' "$KORZA_COMMAND"
printf '  Help:\n    %s --help\n' "$KORZA_COMMAND"
