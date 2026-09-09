// plugins.json is hand-authored while skills.json is generated, so nothing catches a bad edit
// before it renders. These are the two fields where a bad value does more than look wrong:
// `name` is pasted into a terminal as part of an install command, and `homepage` becomes an href.

import { AGENTS } from "@/lib/catalogue-entries";

// Lowercase, digits and hyphens only, so the install command a user copies is a single word and
// `id` is a usable URL segment.
const PLUGIN_NAME = /^[a-z0-9][a-z0-9-]*$/;

const REQUIRED = [
  "id",
  "name",
  "summary",
  "problem",
  "benefits",
  "agents",
  "origin",
  "ref",
  "sourceRepo",
  "homepage",
] as const;

type SkillRow = { plugin: string; ref: string; sourceRepo: string };

function isFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isFilledList(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(isFilled);
}

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function problemsWithPlugin(plugin: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const id = typeof plugin.id === "string" ? plugin.id : "a plugin";

  for (const field of REQUIRED) {
    if (!(field in plugin)) problems.push(`${id}: ${field} is missing`);
  }

  for (const field of [
    "id",
    "name",
    "summary",
    "problem",
    "origin",
    "ref",
    "sourceRepo",
  ]) {
    if (field in plugin && !isFilled(plugin[field])) {
      problems.push(`${id}: ${field} must be a non-empty string`);
    }
  }

  for (const field of ["benefits", "agents"]) {
    if (field in plugin && !isFilledList(plugin[field])) {
      problems.push(
        `${id}: ${field} must be a non-empty list of non-empty strings`,
      );
    }
  }

  if (isFilled(plugin.name) && !PLUGIN_NAME.test(plugin.name as string)) {
    problems.push(
      `${id}: name ${JSON.stringify(plugin.name)} reaches a shell in the install command, so it must match ${PLUGIN_NAME}`,
    );
  }

  // `id` is a route segment: `generateStaticParams` returns it and the card links to it.
  if (isFilled(plugin.id) && !PLUGIN_NAME.test(plugin.id as string)) {
    problems.push(
      `${id}: id ${JSON.stringify(plugin.id)} is a URL segment, so it must match ${PLUGIN_NAME}`,
    );
  }

  // Membership, not just non-empty: `installCommands` filters on these names, so a typo drops
  // that agent's command at render with nothing failing.
  if (Array.isArray(plugin.agents)) {
    const unknown = plugin.agents.filter(
      (agent) => !(AGENTS as readonly string[]).includes(agent as string),
    );
    if (unknown.length > 0) {
      problems.push(
        `${id}: agents ${JSON.stringify(unknown)} render no install command; expected ${JSON.stringify(AGENTS)}`,
      );
    }
  }

  // Optional, but a blank one is worse than none: the card renders it in place of the skill
  // count, so an empty string shows an entry that claims nothing.
  if ("payload" in plugin && !isFilled(plugin.payload)) {
    problems.push(`${id}: payload is present but empty; omit it instead`);
  }

  if ("homepage" in plugin && !isHttpsUrl(plugin.homepage)) {
    problems.push(
      `${id}: homepage ${JSON.stringify(plugin.homepage)} becomes an href, so it must be an absolute https URL`,
    );
  }

  return problems;
}

export function problemsWithPluginSet(
  plugins: Record<string, unknown>[],
  skills: SkillRow[],
): string[] {
  const problems: string[] = [];

  for (const field of ["id", "name"] as const) {
    const seen = new Set<string>();
    for (const plugin of plugins) {
      const value = plugin[field];
      if (typeof value !== "string") continue;
      if (seen.has(value))
        problems.push(
          `two plugins share the ${field} ${JSON.stringify(value)}`,
        );
      seen.add(value);
    }
  }

  // A plugin that ships no skills is not a fault: pyright-lsp is a real entry that resolves to
  // nothing. Only a plugin whose skills contradict it is.
  for (const plugin of plugins) {
    const rows = skills.filter((skill) => skill.plugin === plugin.id);
    for (const field of ["ref", "sourceRepo"] as const) {
      const claimed = new Set(rows.map((row) => row[field]));
      if (
        claimed.size > 0 &&
        !(claimed.size === 1 && claimed.has(plugin[field] as string))
      ) {
        problems.push(
          `${plugin.id}: ${field} is ${JSON.stringify(plugin[field])} but its skills report ${JSON.stringify([...claimed])}`,
        );
      }
    }
  }

  return problems;
}
