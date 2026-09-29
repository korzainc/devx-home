// Hosted previews share infrastructure; collecting there would pollute totals.
export function usageCollectionEnabled(): boolean {
  const { VERCEL, VERCEL_ENV, KORZA_LOCAL_USAGE, DATABASE_URL } = process.env;
  if (VERCEL || VERCEL_ENV)
    return VERCEL === "1" && VERCEL_ENV === "production";
  if (KORZA_LOCAL_USAGE !== "1" || !DATABASE_URL) return false;
  try {
    const database = new URL(DATABASE_URL);
    return (
      ["postgres:", "postgresql:"].includes(database.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) &&
      database.pathname.length > 1 &&
      // pg query parameters can override the URL host. Permit only TLS and
      // session options, including the isolated integration schema.
      [...database.searchParams.keys()].every((key) =>
        ["sslmode", "sslrootcert", "sslcert", "sslkey", "options"].includes(
          key,
        ),
      )
    );
  } catch {
    return false;
  }
}
