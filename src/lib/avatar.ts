/** Fallback for the handful of GitHub accounts whose display name is a single word or a handle. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters =
    words.length === 1
      ? words[0].slice(0, 2)
      : words[0][0] + words[words.length - 1][0];
  return letters.toUpperCase();
}

/**
 * The stored avatar, asked for at the size the header actually draws.
 *
 * GitHub serves 460px from the bare URL and honours its own `s` parameter, so this is the
 * difference between roughly 50KB and 3KB on every page load. 64 rather than 32, for 2x displays.
 *
 * `URL.parse` returns null instead of throwing. That matters here and nowhere else: this runs in
 * the root layout's header, so a value that failed to parse would take down every page rather
 * than one avatar.
 */
export function avatarSrc(image: string): string {
  const url = URL.parse(image);
  if (!url) return image;
  url.searchParams.set("s", "64");
  return url.toString();
}
