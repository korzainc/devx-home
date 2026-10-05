import { metricPlugin } from "./telemetry-catalogue";
import type { NormalizedMetric } from "./telemetry-events";
import {
  array,
  attributes,
  identityText,
  object,
  telemetryHash,
  telemetryName,
} from "./telemetry-validation";

const sorted = (value: unknown) =>
  attributes(value ?? []).sort((a, b) => a.key.localeCompare(b.key));
const nano = (value: unknown): value is string =>
  typeof value === "string" &&
  /^\d{1,20}$/.test(value) &&
  BigInt(value) <= BigInt("18446744073709551615");

export function filterMetrics(
  body: unknown,
  device: string,
): NormalizedMetric[] {
  if (!identityText(device)) throw Error("Missing metric identity");
  const rows: NormalizedMetric[] = [];
  for (const rawResource of array(object(body).resourceMetrics)) {
    const resource = object(rawResource);
    for (const rawScope of array(resource.scopeMetrics ?? [])) {
      const scope = object(rawScope);
      for (const rawMetric of array(scope.metrics ?? [])) {
        const metric = object(rawMetric);
        if (metric.name !== "codex.skill.injected") continue;
        const sum = object(metric.sum),
          temporality = sum.aggregationTemporality;
        if (
          (temporality !== 1 && temporality !== 2) ||
          sum.isMonotonic !== true
        )
          throw Error("Unsupported sum");
        for (const rawPoint of array(sum.dataPoints ?? [])) {
          const point = object(rawPoint);
          const attrs = sorted(point.attributes);
          const read = (key: string) =>
            attrs.find((a) => a.key === key)?.value.stringValue;
          if (read("status") !== "ok") continue;
          const rawValue = point.asInt ?? point.asDouble;
          if (
            (point.asInt !== undefined && point.asDouble !== undefined) ||
            (point.asInt === undefined && typeof point.asDouble !== "number") ||
            !(
              typeof rawValue === "number" ||
              (typeof rawValue === "string" && /^\d+$/.test(rawValue))
            )
          )
            throw Error("Invalid point");
          const value = Number(rawValue);
          if (
            !Number.isSafeInteger(value) ||
            value < 0 ||
            !nano(point.startTimeUnixNano) ||
            !nano(point.timeUnixNano) ||
            BigInt(point.startTimeUnixNano) > BigInt(point.timeUnixNano)
          )
            throw Error("Invalid point");
          const plugin = metricPlugin(read("plugin_id"));
          if (!plugin) continue;
          const identity: unknown[] = [
            device,
            sorted(
              resource.resource === undefined
                ? []
                : object(resource.resource).attributes,
            ),
            scope.scope === undefined ? {} : object(scope.scope),
            metric.name,
            attrs,
            point.startTimeUnixNano,
          ];
          if (temporality === 1) identity.push(point.timeUnixNano);
          const skill = read("skill"),
            invokeType = read("invoke_type");
          rows.push({
            id: telemetryHash(identity),
            value,
            temporality,
            plugin,
            skill: telemetryName(skill) ? skill : null,
            invokeType: telemetryName(invokeType) ? invokeType : null,
          });
          if (rows.length > 1000) throw Error("Too many telemetry records");
        }
      }
    }
  }
  return rows;
}
