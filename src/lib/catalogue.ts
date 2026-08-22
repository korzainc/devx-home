import baselineData from "@/data/baselines.placeholder.json";
import toolsData from "@/data/tools.placeholder.json";
import pluginsData from "@/data/plugins.json";
import type { Baseline, DetectSignals } from "@/lib/gap/types";

// ToolEntry is still a provisional stand-in - the real shape arrives with catalogue.json, built
// by the catalogue repo. Field access is confined to this module and the card renderers so that
// swap stays a small diff rather than a sweep through the UI.
//
// PluginEntry is not provisional: every field is transcribed from korzainc/marketplace, which
// publishes plugins bundling skills rather than standalone skills. `versioning` is the one
// derived field - the manifests carry `ref`, and whether that is a tag or a branch is the thing
// worth filtering on. `agents` holds display labels rather than manifest ids, because the same
// strings appear on the facet chips and above the install commands.

export type CatalogueEntry = {
  id: string;
  name: string;
  summary: string;
};

export type ToolEntry = CatalogueEntry & {
  category: string;
  capabilities: string[];
  stacks: string[];
  docsUrl: string;
  /** What gap analysis looks for to decide the tool is already in use. */
  detect: DetectSignals;
};

export type PluginEntry = CatalogueEntry & {
  // `problem` and `benefits` are the exception: written here rather than transcribed, because the
  // upstream manifests carry a one-line description and nothing that answers "why install this".
  problem: string;
  benefits: string[];
  agents: string[];
  origin: string;
  versioning: string;
  ref: string;
  sourceRepo: string;
  homepage: string;
  skills: string[];
};

/** Keys whose values a facet can group by: a single string, or a list of them. */
export type FacetKey<T> = {
  [K in keyof T]: T[K] extends string | string[] ? K : never;
}[keyof T] &
  string;

export type Facet<T> = {
  key: FacetKey<T>;
  label: string;
};

export function facetValues<T>(entry: T, key: FacetKey<T>): string[] {
  const value = entry[key] as string | string[];
  return Array.isArray(value) ? value : [value];
}

export const tools: ToolEntry[] = toolsData;

export const plugins: PluginEntry[] = pluginsData;

// Which capabilities a stack is expected to have. Separate from the tools because a baseline is a
// statement about stacks, not about any one tool, and the two will be published separately.
export const baseline: Baseline = baselineData;

export const marketplaceName = "korza-marketplace";

export const marketplaceRepo = "korzainc/marketplace";

export function getPlugin(id: string): PluginEntry | undefined {
  return plugins.find((plugin) => plugin.id === id);
}

export type InstallCommand = {
  agent: string;
  /** Registers the marketplace. Needed once per machine, not once per plugin. */
  register: string;
  install: string;
};

/** Only the agents whose manifest actually lists the plugin get a command. */
export function installCommands(plugin: PluginEntry): InstallCommand[] {
  const all: InstallCommand[] = [
    {
      agent: "Claude Code",
      register: `/plugin marketplace add ${marketplaceRepo}`,
      install: `/plugin install ${plugin.name}@${marketplaceName}`,
    },
    {
      agent: "Codex CLI",
      register: `codex plugin marketplace add ${marketplaceRepo} --ref main`,
      install: `codex plugin add ${plugin.name}@${marketplaceName}`,
    },
  ];
  return all.filter((entry) => plugin.agents.includes(entry.agent));
}
