/** Keep the opt-in integration harness on loopback, including pg URL overrides. */
export function localTelemetryTestDatabase(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // Do not include an invalid connection string (and its password) in test output.
    throw Error("Invalid integration database URL");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    [...url.searchParams.keys()].some(
      (key) => !["sslmode", "sslrootcert", "sslcert", "sslkey"].includes(key),
    )
  ) {
    // pg-connection-string lets ?host= override the URL authority. Allow only
    // TLS parameters; the harness adds its own unique schema after this guard.
    throw Error("Integration database must be loopback without URL overrides");
  }
  url.searchParams.set("sslmode", "disable");
  return url;
}
