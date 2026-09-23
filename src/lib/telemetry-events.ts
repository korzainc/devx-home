// Date.parse alone normalizes impossible dates such as February 30. Validate each
// calendar/time field before accepting RFC3339 precision from either native exporter.
function timestamp(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (!match) return false;
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] =
    match.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= days[month - 1] &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    (!match[7] || (offsetHour <= 23 && offsetMinute <= 59)) &&
    Number.isFinite(Date.parse(value))
  );
}
const plugins = ["codezen", "superpowers", "mattpocock-skills", "humanizer"];
const name = (x: unknown) =>
  typeof x === "string" && /^[a-zA-Z0-9_.:-]{1,100}$/.test(x);
const nullableName = (x: unknown) => x === null || name(x);
const id = (x: unknown) => typeof x === "string" && /^[a-f0-9]{64}$/.test(x);
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== keys.sort().join(",")
  )
    throw Error("Invalid normalized record");
  return value as Record<string, unknown>;
}
export type NormalizedEvent = {
  id: string;
  kind: "plugin_installed" | "skill_activated";
  client: "claude" | "codex";
  source: "native_otel" | "korza_cli";
  occurredAt: string;
  plugin: string;
  skill: string | null;
};
export type NormalizedMetric = {
  id: string;
  value: number;
  temporality: 1 | 2;
  plugin: string;
  skill: string | null;
  invokeType: string | null;
};
export function parseBatch(value: unknown): {
  events: NormalizedEvent[];
  metrics: NormalizedMetric[];
} {
  const batch = record(value, ["events", "metrics"]);
  if (
    !Array.isArray(batch.events) ||
    !Array.isArray(batch.metrics) ||
    batch.events.length + batch.metrics.length > 1000
  )
    throw Error("Invalid batch size");
  for (const value of batch.events) {
    const e = record(value, [
      "id",
      "kind",
      "client",
      "source",
      "occurredAt",
      "plugin",
      "skill",
    ]);
    if (
      !id(e.id) ||
      !plugins.includes(e.plugin as string) ||
      !["plugin_installed", "skill_activated"].includes(e.kind as string) ||
      !(
        (e.client === "claude" && e.source === "native_otel") ||
        (e.client === "codex" &&
          e.source === "korza_cli" &&
          e.kind === "plugin_installed")
      ) ||
      !(e.kind === "plugin_installed" ? e.skill === null : name(e.skill)) ||
      !timestamp(e.occurredAt)
    )
      throw Error("Invalid event");
  }
  for (const value of batch.metrics) {
    const m = record(value, [
      "id",
      "value",
      "temporality",
      "plugin",
      "skill",
      "invokeType",
    ]);
    if (
      !id(m.id) ||
      typeof m.value !== "number" ||
      !Number.isSafeInteger(m.value) ||
      m.value < 0 ||
      ![1, 2].includes(m.temporality as number) ||
      !["codezen", "superpowers"].includes(m.plugin as string) ||
      !nullableName(m.skill) ||
      !nullableName(m.invokeType)
    )
      throw Error("Invalid metric");
  }
  return batch as { events: NormalizedEvent[]; metrics: NormalizedMetric[] };
}
