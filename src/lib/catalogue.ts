import "server-only";
import pluginsData from "@/data/plugins.json";
import skillsData from "@/data/skills.json";
import realCatalogueData from "@/data/catalogue.json";
import { capabilityLabelOverrides } from "@/data/capability-labels";
import { installConfigs } from "@/data/install-configs";
import {
  AUDIENCE_FALLBACK,
  pluginAudiences,
  skillAudiences,
} from "@/data/skill-audiences";
import { CATEGORY_FALLBACK, skillCategories } from "@/data/skill-categories";
import { toolCardSummaries } from "@/data/tool-card-summaries";
import {
  isBundle,
  type BundleEntry,
  type InstallCommand,
  type PluginEntry,
  type SkillEntry,
  type ToolEntry,
} from "@/lib/catalogue-entries";
import {
  installMethods,
  type InstallMethod,
  type RawInstall,
} from "@/lib/install-commands";
import type { Baseline, DetectSignals } from "@/lib/gap/types";

// Only the bindings a server file actually imports through this path - facetValues and
// skillCountByPlugin exist in catalogue-entries specifically so a client component never has to
// import this module at all, so re-advertising them here would undo the reason for the split.
export {
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
  install?: RawInstall[];
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
    cardSummary: toolCardSummaries[tool.id] ?? tool.summary,
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
      // Through `capabilityLabel`, not `capability.label` directly, so a gap report and the
      // /tools filter can never name the same capability two different ways.
      Object.keys(catalogue.taxonomy.capabilities).map((id) => [
        id,
        {
          label: capabilityLabel(id as CapabilityId),
          category: categoryLabel(id),
        },
      ]),
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

/** Looked up by id rather than hung off `ToolEntry`, so the raw install data stays out of
 * `PublicToolEntry` and off the wire to the `/tools` grid, which has no use for it. Bundles
 * carry an `install` too, hence the fallback to the bundle table.
 *
 * `docs` methods are dropped here rather than in `installMethods`, which is a pure reading of
 * the catalogue and should stay one: this is the only caller that knows the tool page already
 * renders the same link in its Docs row, so it is the only place that can call it a duplicate.
 * Where a real config file exists for the tool, it takes the dropped method's place. Where one
 * does not, the tool has nothing to install and renders no panel, which is the honest answer
 * for go-test: `go test` ships with the Go toolchain. */
export function toolInstallMethods(id: string): InstallMethod[] {
  // `hasOwn` throughout, not plain indexing: `id` is a route segment, and "constructor" or
  // "toString" would otherwise reach into Object.prototype and build a panel out of a function.
  const entry = Object.hasOwn(realCatalogue.tools, id)
    ? realCatalogue.tools[id]
    : Object.hasOwn(realCatalogue.bundles, id)
      ? realCatalogue.bundles[id]
      : undefined;
  // "Korza's CI image, which already bundles this check" is worth saying on Trivy's page, where
  // the reader may be running the check already without knowing. On the bundle's own page it is
  // circular: that page is the image. Only this function knows whose page it is building.
  const ownsTheImage = Object.hasOwn(realCatalogue.bundles, id);
  const runnable = installMethods(entry?.install)
    .filter((method) => method.kind !== "docs")
    .map((method) =>
      ownsTheImage && method.note ? { ...method, note: undefined } : method,
    );
  if (!Object.hasOwn(installConfigs, id)) return runnable;
  const config = installConfigs[id];
  return [
    ...runnable,
    {
      id: `config-${id}`,
      label: config.label,
      kind: "snippet",
      command: config.content,
      target: config.target,
      note: config.note,
    },
  ];
}

// Audience and category both come off local overlays, so they are merged in here rather than read
// alongside the entry everywhere they are needed. Audience is a field upstream does not carry;
// category is one it does, and this deliberately replaces it. An id an overlay does not name falls
// back rather than throwing: a sync that adds one should still show the new row, and the seam test
// beside the overlay is what fails.
export const plugins: PluginEntry[] = (
  pluginsData as Omit<PluginEntry, "audiences">[]
).map((plugin) => ({
  ...plugin,
  audiences: pluginAudiences[plugin.id] ?? AUDIENCE_FALLBACK,
}));

export const skills: SkillEntry[] = (
  skillsData.skills as Omit<SkillEntry, "audiences" | "category">[]
)
  .filter((skill) => skill.status !== "Planned")
  .map((skill) => ({
    ...skill,
    audiences: skillAudiences[skill.id] ?? AUDIENCE_FALLBACK,
    // Spread first, so the generator's own category is overwritten rather than merged beside.
    category: skillCategories[skill.id] ?? CATEGORY_FALLBACK,
  }));

export const browsableSkills: SkillEntry[] = skills.filter(
  (skill) => skill.kind === "skill",
);

/** Listed and searchable, but outside every facet. */
export const toolchainSkills: SkillEntry[] = skills.filter(
  (skill) => skill.kind !== "skill",
);

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

/** A single capability's label: the local override if there is one, else the taxonomy's own -
 * never touches ecosystems, so it can't fail for an unrelated reason. Throws with the id rather
 * than letting a caller read `.label` off `undefined`, the same as `ecosystemLabel`. */
export function capabilityLabel(id: CapabilityId): string {
  const label =
    capabilityLabelOverrides[id] ??
    realCatalogue.taxonomy.capabilities[id]?.label;
  if (!label) {
    throw new Error(`No capability "${id}" in the catalogue taxonomy.`);
  }
  return label;
}

/**
 * Every capability's label, for the client components that cannot call `capabilityLabel` because
 * this module is server-only. Fourteen entries, so it costs nothing to hand the whole map over
 * rather than thread a lookup down through the card.
 */
export const capabilityLabels: Record<string, string> = Object.fromEntries(
  Object.keys(realCatalogue.taxonomy.capabilities).map((id) => [
    id,
    capabilityLabel(id as CapabilityId),
  ]),
);

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
