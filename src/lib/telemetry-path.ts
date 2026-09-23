// These exact handlers authenticate device clients themselves, without browser cookies.
export function isTelemetryPath(path: string) {
  return [
    "/api/telemetry/logs",
    "/api/telemetry/metrics",
    "/api/telemetry/exchange",
    "/api/telemetry/events",
    "/api/telemetry/revoke",
  ].includes(path);
}
