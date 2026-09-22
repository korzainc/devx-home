import "server-only";
import { getPool } from "./db";

export type SkillUsage = { claude?: number; codex?: number };

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
  const codex = await getPool().query<{ skill: string; count: string }>({
    text: "select skill, sum(value)::text as count from telemetry_skill_metrics where skill=any($1::text[]) group by skill",
    values: [codexNames],
    ...{ query_timeout: 1000 },
  });
  for (const row of claude.rows) {
    const name = names.find(
      (name) => row.skill === name || row.skill === `${plugin}:${name}`,
    );
    if (!name) continue;
    const count = Number(row.count);
    if (Number.isSafeInteger(count) && count > 0)
      result[name] = { claude: (result[name]?.claude ?? 0) + count };
  }
  for (const row of codex.rows) {
    const index = codexNames.indexOf(row.skill);
    const count = Number(row.count);
    if (index < 0 || !Number.isSafeInteger(count) || count <= 0) continue;
    const name = names[index];
    result[name] = { ...result[name], codex: count };
  }
  return result;
}

export async function readPluginInstalls(
  plugin: string,
): Promise<number | undefined> {
  const result = await getPool().query<{ count: string }>({
    text: "select count(*)::text as count from telemetry_events where plugin=$1 and kind='plugin_installed'",
    values: [plugin],
    ...{ query_timeout: 1000 },
  });
  const count = Number(result.rows[0]?.count);
  return Number.isSafeInteger(count) && count > 0 ? count : undefined;
}
