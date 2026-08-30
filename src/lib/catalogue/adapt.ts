import type { AnalysisTool, Baseline, BaselineStack } from "@/lib/gap/types";
import type {
  Catalogue,
  CatalogueBundle,
  CatalogueTool,
  Invocation,
  InvocationBlock,
} from "./schema";

// Translates the published catalogue artifact into the types `src/lib/gap` already consumes, so
// the analysis engine did not have to change shape when the catalogue replaced the placeholders.
//
// The two shapes disagree in ways worth naming: the artifact keys entities by id where the engine
// wants arrays, splits detection by vendor where the engine wants one flat set of signals, and
// states baselines per ecosystem where the engine wants a list of stacks. Each of those is a
// mapping, and each one lives in exactly one function below.

/** The artifact's spelling of "applies to everything". The engine still calls this `any`. */
const anyLanguage = "*";

export function entries(
  catalogue: Catalogue,
): (CatalogueTool | CatalogueBundle)[] {
  // Bundles are detectable and recommendable exactly like tools, so the engine sees one list.
  // `ci-base-checks` satisfying six capabilities is not a special case anywhere downstream.
  return [
    ...Object.values(catalogue.tools),
    ...Object.values(catalogue.bundles),
  ];
}

/**
 * A bundle carries one invocation covering every capability it wraps; a tool keys its invocations
 * by capability. Telling them apart structurally rather than by entity type keeps this working if
 * a tool ever adopts the single-invocation shape.
 */
export function invocationFor(
  entry: CatalogueTool,
  capability: string,
): Invocation | null {
  const github = (entry.invocation as InvocationBlock | undefined)?.github;
  if (!github) return null;

  const single = github as Invocation;
  if (single.action || single.image || single.runner) {
    return entry.capabilities.includes(capability) ? single : null;
  }

  const perCapability = github as Record<string, Invocation>;
  return perCapability[capability] ?? null;
}

/** Flattens vendor-keyed detection onto the engine's single signal set. GitHub only, for now. */
function detectSignals(entry: CatalogueTool) {
  const detection = entry.detection ?? {};
  return {
    ciUses: detection.github?.ciUses ?? [],
    commands: detection.github?.commands ?? [],
    configFiles: detection.configFiles ?? [],
    manifestDeps: detection.manifestDeps ?? [],
  };
}

export function toAnalysisTools(catalogue: Catalogue): AnalysisTool[] {
  return entries(catalogue).map((entry) => ({
    id: entry.id,
    name: entry.name,
    capabilities: entry.capabilities,
    // `applicability.languages` replaced the flat `stacks` array, and `*` replaced `any`. The
    // engine's stack filter is unchanged, so the translation happens here rather than there.
    stacks: (entry.applicability?.languages ?? [anyLanguage]).map((language) =>
      language === anyLanguage ? "any" : language,
    ),
    detect: detectSignals(entry),
  }));
}

/**
 * One baseline file per ecosystem becomes one stack. `expects` keeps only the capabilities the
 * baseline marks `required`: an advisory rule is not a gap, and reporting it as one would make
 * every repo look worse than the baseline actually claims.
 */
export function toBaseline(catalogue: Catalogue): Baseline {
  const stacks: BaselineStack[] = Object.values(catalogue.baselines).map(
    (baseline) => ({
      id: baseline.ecosystem,
      label: baseline.ecosystem,
      markers: baseline.markers,
      expects: Object.fromEntries(
        Object.entries(baseline.baseline)
          .filter(([, rule]) => rule.required)
          .map(([capability, rule]) => [
            capability,
            {
              recommended: rule.recommended,
              acceptable: rule.acceptable ?? [],
            },
          ]),
      ),
    }),
  );

  const capabilities = Object.fromEntries(
    Object.entries(catalogue.taxonomy.capabilities).map(([id, meta]) => [
      id,
      {
        label: meta.label,
        category:
          catalogue.taxonomy.categories[meta.category]?.label ?? meta.category,
      },
    ]),
  );

  return {
    categories: Object.values(catalogue.taxonomy.categories).map(
      (category) => category.label,
    ),
    capabilities,
    // Every capability the artifact states is stated per ecosystem, so nothing is universal in
    // the way the placeholder baseline meant it. An empty list is the honest translation.
    universal: [],
    stacks,
  };
}

/** Which entry the baseline would put against a capability, `recommended` before `acceptable`. */
export function preferredFor(
  catalogue: Catalogue,
  ecosystem: string,
  capability: string,
): string[] {
  const rule = catalogue.baselines[ecosystem]?.baseline[capability];
  if (!rule) return [];
  return [rule.recommended, ...(rule.acceptable ?? [])];
}
