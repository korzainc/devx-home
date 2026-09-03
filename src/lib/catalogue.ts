import "server-only";
import pluginsData from "@/data/plugins.json";
import skillsData from "@/data/skills.json";
import realCatalogueData from "@/data/catalogue.json";
import {
  isBundle,
  type BundleEntry,
  type InstallCommand,
  type PluginEntry,
  type SkillEntry,
  type ToolEntry,
} from "@/lib/catalogue-entries";
import type { Baseline, DetectSignals } from "@/lib/gap/types";

// Only the bindings a server file actually imports through this path - facetValues and
// skillCountByPlugin exist in catalogue-entries specifically so a client component never has to
// import this module at all, so re-advertising them here would undo the reason for the split.
export {
  CATEGORIES,
  isBundle,
  publicToolEntry,
  shortAgents,
  skillFacets,
  type BundleEntry,
  type CatalogueEntry,
  type Facet,
  type FacetKey,
  type InstallCommand,
  type PluginEntry,
  type PublicBundleEntry,
  type PublicToolEntry,
  type SkillEntry,
  type ToolEntry,
} from "@/lib/catalogue-entries";

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

/** Every real capability id, straight off the raw import - not the `as RealCatalogue` cast
 * above, which widens the keys to `string`. A caller naming one by hand (the homepage's sample
 * run) gets a compile error the moment the taxonomy drops or renames it, instead of a runtime
 * crash discovered by whoever loads the page next. */
export type CapabilityId = keyof typeof realCatalogueData.taxonomy.capabilities;

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

export function ecosystemLabel(id: string): string {
  const label = ECOSYSTEM_LABELS[id];
  if (!label) {
    throw new Error(
      `No display label is pinned for ecosystem "${id}" in ECOSYSTEM_LABELS.`,
    );
  }
  return label;
}

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
      label: ecosystemLabel(ecosystem.ecosystem),
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

export const indexSchemaVersion: number = skillsData.schemaVersion;

export function skillsForPlugin(pluginId: string): SkillEntry[] {
  return skills.filter((skill) => skill.plugin === pluginId);
}

// Which capabilities a stack is expected to have. Separate from the tools because a baseline is a
// statement about stacks, not about any one tool, and the two are authored separately upstream.
let cachedBaseline: Baseline | undefined;

/** Lazy and memoized: an upstream ecosystem with no pinned label (see ecosystemLabel) should
 * fail the routes that actually read the baseline, not every route that merely imports this
 * module at build time. `??=` re-throws on every call rather than caching a bad result. */
export function getBaseline(): Baseline {
  return (cachedBaseline ??= flattenBaseline(realCatalogue));
}

/** A single capability's label, straight from the taxonomy - never touches ecosystems, so it
 * can't fail for an unrelated reason. Throws with the id rather than letting a caller read
 * `.label` off `undefined`, the same as `ecosystemLabel`. */
export function capabilityLabel(id: CapabilityId): string {
  const label = realCatalogue.taxonomy.capabilities[id]?.label;
  if (!label) {
    throw new Error(`No capability "${id}" in the catalogue taxonomy.`);
  }
  return label;
}

export const marketplaceName = "korza-marketplace";

export const marketplaceRepo = "korzainc/marketplace";

export function getPlugin(id: string): PluginEntry | undefined {
  return plugins.find((plugin) => plugin.id === id);
}

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
