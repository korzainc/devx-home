import pluginsData from "@/data/plugins.json";
import skillsData from "@/data/skills.json";
import realCatalogueData from "@/data/catalogue.json";
import type { Baseline, DetectSignals } from "@/lib/gap/types";

// Every tool, bundle, and baseline entry devx-home renders comes from the real CI catalogue:
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
  // Written here: the manifests answer "what", not "why install this".
  problem: string;
  benefits: string[];
  agents: string[];
  origin: string;
  ref: string;
  sourceRepo: string;
  homepage: string;
  skills: string[];
};

// Generated by `python -m generator` in korzainc/marketplace.
// `id` is `plugin:path`: names are not unique.
export type SkillEntry = CatalogueEntry & {
  path: string;
  plugin: string;
  origin: string;
  agents: string[];
  sourceRepo: string;
  ref: string;
  pinned: boolean;
  category: string;
  /** "setup" and "meta" are listed but never faceted. */
  kind: "skill" | "setup" | "meta";
  /** Searched, not rendered. */
  jobs: string[];
  /** Upstream's own SKILL.md text. Written for an agent, so it is long and often opens
   * "Use when". The detail page shows it; the card shows `summary`. */
  description: string;
  invocation: string;
  licence: { spdx: string; osiApproved: boolean; source: string };
  /** Null when no Korza team owns it. */
  ownerTeam: string | null;
  /** Null everywhere: every derivable value restates another field. */
  maturity: string | null;
  status: string;
};

export const CATEGORIES = [
  "Discover",
  "Decide",
  "Build",
  "Document",
  "Verify",
  "Coordinate",
] as const;

/** Here, not in the component, so the tests filter with the real list. */
export const skillFacets: Facet<SkillEntry>[] = [
  { key: "category", label: "Category" },
  { key: "plugin", label: "Plugin" },
  { key: "origin", label: "Origin" },
  { key: "agents", label: "Agent" },
];

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

export type PluginRow = PluginEntry & { pinState: string };

export const plugins: PluginEntry[] = pluginsData;

// "N behind" only means anything for an entry pinned to a tag.
export type VersionStatus = {
  state: "behind" | "current" | "unpinned" | "no-releases";
  pinned: string;
  latest: string | null;
  /** Null unless state is "behind". */
  behind: number | null;
};

// A JSON import widens every string, so `kind` arrives as `string`.
// Planned rows stay in the index but are hidden for now: nobody can install one.
export const skills: SkillEntry[] = (skillsData.skills as SkillEntry[]).filter(
  (skill) => skill.status !== "Planned",
);

export const browsableSkills: SkillEntry[] = skills.filter(
  (skill) => skill.kind === "skill",
);

/** Listed and searchable, but outside every facet. */
export const toolchainSkills: SkillEntry[] = skills.filter(
  (skill) => skill.kind !== "skill",
);

const versions = skillsData.versions as Record<string, VersionStatus>;

export function versionStatusFor(pluginId: string): VersionStatus | undefined {
  return versions[pluginId];
}

export const pluginRows: PluginRow[] = plugins.map((plugin) => ({
  ...plugin,
  pinState: versionFacetLabel(versionStatusFor(plugin.id)),
}));

/** Derived, not stored: two descriptions of one fact had drifted into a contradiction. */
export function versionFacetLabel(status: VersionStatus | undefined): string {
  switch (status?.state) {
    case "behind":
      return "Behind";
    case "current":
      return "Current";
    case "unpinned":
      return "Unpinned";
    case "no-releases":
      return "No releases";
    default:
      return "Unknown";
  }
}

/** `versions` is cast from JSON, so an unknown state reaches the default arm. */
export function describeVersion(status: VersionStatus): string {
  switch (status.state) {
    case "behind":
      return `${status.behind} version${status.behind === 1 ? "" : "s"} behind (${status.latest})`;
    case "current":
      return "current";
    case "unpinned":
      return `unpinned, upstream is at ${status.latest}`;
    case "no-releases":
      return "unpinned, upstream has no releases";
    default:
      return `pin state unknown (${String(status.state)})`;
  }
}

export const skillsArePlaceholder: boolean = skillsData.placeholder === true;

export const indexSchemaVersion: number = skillsData.schemaVersion;

export function skillsForPlugin(pluginId: string): SkillEntry[] {
  return skills.filter((skill) => skill.plugin === pluginId);
}

/** Computed, so a new overlap appears without anyone maintaining a list. */
export function claimsByName(entries: SkillEntry[]): Map<string, string[]> {
  const byName = new Map<string, Set<string>>();
  for (const skill of entries) {
    const seen = byName.get(skill.name) ?? new Set<string>();
    seen.add(skill.plugin);
    byName.set(skill.name, seen);
  }
  return new Map(
    [...byName]
      .filter(([, plugins]) => plugins.size > 1)
      .map(([name, plugins]) => [name, [...plugins].sort()]),
  );
}

export const duplicateClaims: Map<string, string[]> = claimsByName(skills);

export function rivalPlugins(skill: SkillEntry): string[] {
  return (duplicateClaims.get(skill.name) ?? []).filter(
    (plugin) => plugin !== skill.plugin,
  );
}

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
  /** Once per machine, not once per plugin. */
  register: string;
  install: string;
};

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
