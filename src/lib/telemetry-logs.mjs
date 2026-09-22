import { createHash } from "node:crypto";
const array = (x) => {
  if (!Array.isArray(x)) throw new Error("Invalid OTLP array");
  return x;
};
const text = (x) => typeof x === "string" && x.length > 0 && x.length <= 200;
const names = (x) =>
  text(x) && !["third-party", "custom_skill"].includes(x) ? x : null;
export function filterLogs(body, device) {
  const rows = [];
  for (const resource of array(body?.resourceLogs))
    for (const scope of array(resource.scopeLogs))
      for (const log of array(scope.logRecords)) {
        const attrs = Object.fromEntries(
          array(log.attributes).map((a) => [
            a.key,
            a.value?.stringValue ?? a.value?.intValue,
          ]),
        );
        const kind = attrs["event.name"];
        if (!["plugin_installed", "skill_activated"].includes(kind)) continue;
        if (
          attrs["marketplace.name"] !== "korza-marketplace" ||
          ![
            "codezen",
            "superpowers",
            "mattpocock-skills",
            "humanizer",
          ].includes(attrs["plugin.name"])
        )
          continue;
        if (kind === "skill_activated" && !names(attrs["skill.name"])) continue;
        const time = attrs["event.timestamp"],
          session = attrs["session.id"],
          sequence = String(attrs["event.sequence"] ?? "");
        if (
          !text(device) ||
          !text(session) ||
          !/^\d+$/.test(sequence) ||
          !text(time) ||
          !Number.isFinite(Date.parse(time))
        )
          throw new Error("Missing event identity");
        const id = createHash("sha256")
          .update(JSON.stringify([device, session, sequence, time, kind]))
          .digest("hex");
        rows.push({
          id,
          kind,
          occurredAt: new Date(time).toISOString(),
          plugin: names(attrs["plugin.name"]),
          skill: kind === "skill_activated" ? names(attrs["skill.name"]) : null,
        });
      }
  return rows;
}
