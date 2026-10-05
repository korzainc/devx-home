import { telemetryPlugin } from "./telemetry-catalogue";
import { telemetryName as name, timestamp } from "./telemetry-validation";
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
      !(e.client === "claude" || e.client === "codex") ||
      !telemetryPlugin(e.plugin, e.client) ||
      !["plugin_installed", "skill_activated"].includes(e.kind as string) ||
      !(
        (e.client === "claude" && e.source === "native_otel") ||
        (e.client === "codex" &&
          e.source === "native_otel" &&
          e.kind === "plugin_installed") ||
        (["claude", "codex"].includes(e.client as string) &&
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
      !telemetryPlugin(m.plugin, "codex") ||
      !nullableName(m.skill) ||
      !nullableName(m.invokeType)
    )
      throw Error("Invalid metric");
  }
  return batch as { events: NormalizedEvent[]; metrics: NormalizedMetric[] };
}
