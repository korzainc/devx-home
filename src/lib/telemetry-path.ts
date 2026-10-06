// These exact handlers authenticate device clients themselves, without browser cookies.
export function isTelemetryPath(path: string) {
  return [
    "/api/telemetry/enroll",
    "/api/telemetry/exchange",
    "/api/telemetry/events",
    "/api/telemetry/revoke",
  ].includes(path);
}
