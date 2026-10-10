import { plugins } from "@/lib/catalogue";

export const telemetryMarketplace = "korza-marketplace";

// The catalogue is the approval list. Native metrics are supported only for
// plugins that the catalogue makes available to Codex.
export function telemetryPlugin(
  value: unknown,
  client: "claude" | "codex",
): value is string {
  return (
    typeof value === "string" &&
    plugins.some(
      (plugin) =>
        plugin.id === value &&
        plugin.agents.includes(
          client === "codex" ? "Codex CLI" : "Claude Code",
        ),
    )
  );
}

export function metricPlugin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const suffix = `_${telemetryMarketplace}`;
  if (!value.endsWith(suffix)) return null;
  const plugin = value.slice(0, -suffix.length);
  return telemetryPlugin(plugin, "codex") ? plugin : null;
}
