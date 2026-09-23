/** Keep local OAuth state on the host registered for the GitHub callback. */
export function localAuthOrigin(host: string | null): string | null {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL) return null;
  const loopback = /^(localhost|127\.0\.0\.1|\[::1\])(:[0-9]+)?$/i;
  if (!host || !loopback.test(host)) return null;
  try {
    const configured = new URL(process.env.BETTER_AUTH_URL ?? "");
    const incoming = new URL(`http://${host}`);
    if (
      configured.protocol !== "http:" ||
      configured.username ||
      configured.password ||
      !loopback.test(configured.host) ||
      configured.port !== incoming.port ||
      configured.host === incoming.host
    )
      return null;
    return configured.origin;
  } catch {
    return null;
  }
}
