import "server-only";
import { getPool } from "./db";

type UsageCount = number | string;
export type SkillUsage = { claude?: UsageCount; codex?: UsageCount };

function positiveCount(value: string): bigint | undefined {
  return /^[1-9]\d*$/.test(value) ? BigInt(value) : undefined;
}

// PostgreSQL aggregates can exceed the safe input range. Keep exact arithmetic
// on the server and send decimal strings only above the safe integer range.
function displayCount(value: bigint): UsageCount {
  return value <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(value)
    : value.toString();
}

// Match the catalogue explicitly; never merge similarly named skills across plugins.
export async function readSkillUsage(plugin: string, names: string[]) {
  const result: Record<string, SkillUsage> = {};
  if (!names.length) return result;
  const claudeNames = names.flatMap((name) => [name, `${plugin}:${name}`]);
  const claude = await getPool().query<{ skill: string; count: string }>({
    text: "select skill, count(*)::text as count from telemetry_events where plugin=$1 and kind='skill_activated' and skill=any($2::text[]) group by skill",
    values: [plugin, claudeNames],
    ...{ query_timeout: 1000 },
  });
  const codexNames = names.map((name) => `${plugin}_${name}`);
  // Pilot rows predate the plugin column. Retain those only when their exact
  // catalogue-prefixed skill matches; an explicit different plugin never counts.
  const codex = await getPool().query<{ skill: string; count: string }>({
    text: "select skill, sum(value)::text as count from telemetry_skill_metrics where (plugin=$1 or plugin is null) and skill=any($2::text[]) group by skill",
    values: [plugin, codexNames],
    ...{ query_timeout: 1000 },
  });
  for (const row of claude.rows) {
    const name = names.find(
      (name) => row.skill === name || row.skill === `${plugin}:${name}`,
    );
    if (!name) continue;
    const count = positiveCount(row.count);
    if (count !== undefined)
      result[name] = {
        claude: displayCount(BigInt(result[name]?.claude ?? 0) + count),
      };
  }
  for (const row of codex.rows) {
    const index = codexNames.indexOf(row.skill);
    const count = positiveCount(row.count);
    if (index < 0 || count === undefined) continue;
    const name = names[index];
    result[name] = { ...result[name], codex: displayCount(count) };
  }
  return result;
}

// Count recorded reports, not unique installations. Source provenance remains in
// the database; historical reports from different sources can describe one install.
export type PluginInstalls = {
  claude?: UsageCount;
  codex?: UsageCount;
};
export async function readPluginInstalls(
  plugin: string,
): Promise<PluginInstalls> {
  const result = await getPool().query<{
    client: string;
    source: string;
    count: string;
  }>({
    text: "select client, source, count(*)::text as count from telemetry_events where plugin=$1 and kind='plugin_installed' group by client, source",
    values: [plugin],
    ...{ query_timeout: 1000 },
  });
  const counts: PluginInstalls = {};
  for (const row of result.rows) {
    if (
      (row.client !== "claude" && row.client !== "codex") ||
      (row.source !== "native_otel" && row.source !== "korza_cli")
    )
      continue;
    const total = positiveCount(row.count);
    if (total === undefined) continue;
    counts[row.client] = displayCount(BigInt(counts[row.client] ?? 0) + total);
  }
  return counts;
}
