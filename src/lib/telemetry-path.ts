// These handlers authenticate exporters themselves, without browser cookies.
export function isTelemetryPath(path: string) {
  return path === "/api/telemetry/logs" || path === "/api/telemetry/metrics";
}
