import { createHash } from "node:crypto";
const hash = (x) =>
  createHash("sha256").update(JSON.stringify(x)).digest("hex");
const sorted = (attrs) =>
  [...(attrs ?? [])].sort((a, b) => String(a.key).localeCompare(String(b.key)));
export function filterMetrics(body, device) {
  if (!Array.isArray(body.resourceMetrics)) throw Error("invalid metrics");
  const rows = [];
  for (const resource of body.resourceMetrics)
    for (const scope of resource.scopeMetrics ?? [])
      for (const metric of scope.metrics ?? []) {
        if (metric.name !== "codex.skill.injected") continue;
        const sum = metric.sum;
        if (
          !sum ||
          ![1, 2].includes(sum.aggregationTemporality) ||
          sum.isMonotonic !== true
        )
          throw Error("unsupported sum");
        for (const point of sum.dataPoints ?? []) {
          const value = Number(point.asInt ?? point.asDouble);
          if (
            !Number.isSafeInteger(value) ||
            value < 0 ||
            !/^\d+$/.test(point.startTimeUnixNano ?? "") ||
            !/^\d+$/.test(point.timeUnixNano ?? "")
          )
            throw Error("invalid point");
          const attrs = sorted(point.attributes);
          const identity = [
            device,
            sorted(resource.resource?.attributes),
            scope.scope ?? {},
            metric.name,
            attrs,
            point.startTimeUnixNano,
          ];
          if (sum.aggregationTemporality === 1)
            identity.push(point.timeUnixNano);
          const read = (key) => {
            const s = attrs.find((a) => a.key === key)?.value?.stringValue;
            return typeof s === "string" && /^[a-zA-Z0-9_.:-]{1,100}$/.test(s)
              ? s
              : null;
          };
          const plugin = attrs.find((a) => a.key === "plugin_id")?.value
            ?.stringValue;
          if (
            ![
              "codezen_korza-marketplace",
              "superpowers_korza-marketplace",
            ].includes(plugin)
          )
            continue;
          rows.push({
            id: hash(identity),
            value,
            temporality: sum.aggregationTemporality,
            skill: read("skill"),
            invokeType: read("invoke_type"),
          });
        }
      }
  return rows;
}
