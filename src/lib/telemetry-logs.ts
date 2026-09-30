import { telemetryMarketplace, telemetryPlugin } from "./telemetry-catalogue";
import type { NormalizedEvent } from "./telemetry-events";
import {
  array,
  attributes,
  identityText,
  object,
  telemetryHash,
  telemetryName,
  timestamp,
} from "./telemetry-validation";

export function filterLogs(
  body: unknown,
  device: string,
): Omit<NormalizedEvent, "client" | "source">[] {
  if (!identityText(device)) throw Error("Missing event identity");
  const rows: Omit<NormalizedEvent, "client" | "source">[] = [];
  for (const rawResource of array(object(body).resourceLogs)) {
    for (const rawScope of array(object(rawResource).scopeLogs)) {
      for (const rawLog of array(object(rawScope).logRecords)) {
        const attrs = Object.fromEntries(
          attributes(object(rawLog).attributes).map((a) => [
            a.key,
            a.value.stringValue ?? a.value.intValue,
          ]),
        );
        const kind = attrs["event.name"];
        if (kind !== "plugin_installed" && kind !== "skill_activated") continue;
        const plugin = attrs["plugin.name"];
        if (
          attrs["marketplace.name"] !== telemetryMarketplace ||
          !telemetryPlugin(plugin, "claude")
        )
          continue;
        const skill = attrs["skill.name"];
        if (
          kind === "skill_activated" &&
          (!telemetryName(skill) ||
            ["third-party", "custom_skill"].includes(skill))
        )
          continue;
        const time = attrs["event.timestamp"],
          session = attrs["session.id"],
          sequence = attrs["event.sequence"];
        if (
          !identityText(session) ||
          !(typeof sequence === "string" || typeof sequence === "number") ||
          (typeof sequence === "number" && !Number.isSafeInteger(sequence)) ||
          !/^\d{1,100}$/.test(String(sequence)) ||
          !timestamp(time)
        )
          throw Error("Missing event identity");
        rows.push({
          id: telemetryHash([device, session, String(sequence), time, kind]),
          kind,
          occurredAt: new Date(time).toISOString(),
          plugin,
          skill: kind === "skill_activated" ? (skill as string) : null,
        });
        if (rows.length > 1000) throw Error("Too many telemetry records");
      }
    }
  }
  return rows;
}
