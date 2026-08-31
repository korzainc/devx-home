import pluginsData from "@/data/plugins.json";
import realCatalogueData from "@/data/catalogue.json";
import type { Baseline, DetectSignals } from "@/lib/gap/types";

// Every tool, bundle, and baseline entry devx-home renders comes from the real catalogue:
// nothing here is invented or placeholder data.
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
  problem: string;
  benefits: string[];
  /** What gap analysis looks for to decide the tool is already in use. */
  detect: DetectSignals;
};

export type BundleEntry = ToolEntry & {
  wraps: { tool: string; capabilities: string[] }[];
};

export function isBundle(entry: ToolEntry | BundleEntry): entry is BundleEntry {
  return "wraps" in entry;
}

type RealTool = {
  id: string;
  name: string;
  summary: string;
  problem?: string;
  benefits?: string[];
  capabilities: string[];
  // Only `languages` is read (see `realStacks`). `buildSystems` exists on every real tool
  // entry too, but nothing here derives anything from it yet.
  applicability: { languages: string[] };
  docsUrl: string;
  detection?: {
    github?: { ciUses?: string[]; commands?: string[] };
    configFiles?: string[];
    manifestDeps?: string[];
  };
};

type RealBundle = RealTool & {
  wraps: { tool: string; capabilities: string[] }[];
};

type RealBaselineEntry = {
  recommended: string;
  acceptable: string[];
  required: boolean;
};

type RealEcosystemBaseline = {
  ecosystem: string;
  markers: string[];
  baseline: Record<string, RealBaselineEntry>;
};

type RealCatalogue = {
  taxonomy: {
    categories: Record<string, { label: string }>;
    capabilities: Record<string, { category: string; label: string }>;
  };
  tools: Record<string, RealTool>;
  bundles: Record<string, RealBundle>;
  baselines: Record<string, RealEcosystemBaseline>;
};

const realCatalogue = realCatalogueData as RealCatalogue;

function realStacks(languages: string[]): string[] {
  const filtered = languages.filter((lang) => lang !== "*");
  return filtered.length > 0 ? filtered : ["any"];
}

function categoryLabel(capability: string): string {
  const categoryId = realCatalogue.taxonomy.capabilities[capability]?.category;
  if (!categoryId) return "Other";
  return realCatalogue.taxonomy.categories[categoryId]?.label ?? "Other";
}

// Looks up capability -> category id -> category label rather than hardcoding a string. Most
// tools/bundles agree on one category across all their capabilities; the rare exception (e.g.
// ci-base-checks, mostly security plus one quality capability) still needs a single label, so
// the majority wins over whichever capability is listed first.
function realCategory(capabilities: string[]): string {
  const counts = new Map<string, number>();
  for (const capability of capabilities) {
    const label = categoryLabel(capability);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const [topLabel] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [
    "Other",
  ];
  return topLabel;
}

function realDetect(tool: RealTool): DetectSignals {
  return {
    ciUses: tool.detection?.github?.ciUses,
    commands: tool.detection?.github?.commands,
    configFiles: tool.detection?.configFiles,
    manifestDeps: tool.detection?.manifestDeps,
  };
}

function toolFromReal(tool: RealTool): ToolEntry {
  return {
    id: tool.id,
    name: tool.name,
    summary: tool.summary,
    problem: tool.problem ?? "",
    benefits: tool.benefits ?? [],
    category: realCategory(tool.capabilities),
    capabilities: tool.capabilities,
    stacks: realStacks(tool.applicability.languages),
    docsUrl: tool.docsUrl,
    detect: realDetect(tool),
  };
}

function bundleFromReal(bundle: RealBundle): BundleEntry {
  return {
    ...toolFromReal(bundle),
    wraps: bundle.wraps,
  };
}

const ECOSYSTEM_LABELS: Record<string, string> = {
  java: "Java",
  javascript: "JavaScript",
  typescript: "TypeScript",
  go: "Go",
  python: "Python",
  docker: "Docker",
};

function flattenBaseline(catalogue: RealCatalogue): Baseline {
  const ecosystems = Object.values(catalogue.baselines);
  return {
    categories: Object.values(catalogue.taxonomy.categories).map(
      (category) => category.label,
    ),
    capabilities: Object.fromEntries(
      Object.entries(catalogue.taxonomy.capabilities).map(
        ([id, capability]) => [
          id,
          { label: capability.label, category: categoryLabel(id) },
        ],
      ),
    ),
    // The real schema has no "universal" concept: every ecosystem lists its own security and
    // dependency-update capabilities directly (see java.json) rather than through a shared
    // bucket. A capability common to every stack just appears in each stack's own `expects`.
    universal: [],
    stacks: ecosystems.map((ecosystem) => ({
      id: ecosystem.ecosystem,
      label: ECOSYSTEM_LABELS[ecosystem.ecosystem] ?? ecosystem.ecosystem,
      markers: ecosystem.markers,
      // recommended/acceptable pass through unchanged; required doesn't, since devx-home's
      // report only distinguishes "satisfied" from "gap", not required vs optional.
      expects: Object.fromEntries(
        Object.entries(ecosystem.baseline).map(([id, entry]) => [
          id,
          { recommended: entry.recommended, acceptable: entry.acceptable },
        ]),
      ),
    })),
  };
}

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

const realTools = Object.values(realCatalogue.tools).map(toolFromReal);
const realBundles = Object.values(realCatalogue.bundles).map(bundleFromReal);

export const tools: ToolEntry[] = [...realTools, ...realBundles];

/** Every bundle, derived from the same `tools` array `visibleTools`/gap-analysis both use,
 * not a second independently-sourced list, so the two can't drift apart. */
export const bundles: BundleEntry[] = tools.filter(isBundle);

const wrappedToolIds = new Set(
  bundles.flatMap((bundle) => bundle.wraps.map((entry) => entry.tool)),
);

/** What the `/tools` grid renders: wrapped tools stay in `tools` itself (gap-analysis needs
 * their detect signals) but stop being their own cards once a bundle covers them. Bundles
 * need no re-adding here since `bundles` is already a view of `tools`. */
export const visibleTools: ToolEntry[] = tools.filter(
  (tool) => !wrappedToolIds.has(tool.id),
);

export const plugins: PluginEntry[] = pluginsData;

// Which capabilities a stack is expected to have. Separate from the tools because a baseline is a
// statement about stacks, not about any one tool, and the two will be published separately.
export const baseline: Baseline = flattenBaseline(realCatalogue);

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
