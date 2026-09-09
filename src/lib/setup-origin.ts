/** Installer origins come from deployment settings, never request headers. */
export function getSetupOrigin(): string | null {
  const deployedHost =
    process.env.VERCEL_ENV === "production"
      ? (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL)
      : process.env.VERCEL_URL;
  const configured =
    process.env.KORZA_PUBLIC_ORIGIN ??
    process.env.DEVX_PUBLIC_ORIGIN ??
    (deployedHost
      ? `https://${deployedHost}`
      : process.env.NODE_ENV === "development"
        ? `http://localhost:${process.env.PORT ?? "3000"}`
        : null);
  if (!configured) return null;

  try {
    const url = new URL(configured);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const allowedProtocol =
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        local &&
        process.env.NODE_ENV !== "production");
    if (
      !allowedProtocol ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
