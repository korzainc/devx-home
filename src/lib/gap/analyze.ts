import { detectStacks, detectTools } from "./detect";
import type { CiSignals } from "./detect";
import { CatalogueDataError, refLabel } from "./types";
import type {
  Analysis,
  AnalysisTool,
  Baseline,
  BaselineStack,
  CapabilityReport,
  CategoryReport,
  PresentTool,
  RecommendedTool,
  RepoSnapshot,
} from "./types";

/** Every stack in `targetStacks` that expects capability `id`, keyed by the tool id it names,
 * with the labels of every stack that named it. Two stacks naming the same tool merge into one
 * entry instead of repeating it. */
function recommendationsByToolId(
  targetStacks: BaselineStack[],
  id: string,
): Map<string, string[]> {
  const byToolId = new Map<string, string[]>();

  for (const stack of targetStacks) {
    const entry = stack.expects[id];
    if (!entry) continue;

    const labels = byToolId.get(entry.recommended) ?? [];
    if (!labels.includes(stack.label)) labels.push(stack.label);
    byToolId.set(entry.recommended, labels);
  }

  return byToolId;
}

/** Resolves each accumulated tool id against the catalogue. A baseline naming a tool id the
 * catalogue doesn't have is a data bug, not a real user-input path - `catalogue.test.ts` already
 * asserts this never happens for real data, so this throws rather than silently dropping it. */
function toRecommendedTools(
  byToolId: Map<string, string[]>,
  toolById: Map<string, AnalysisTool>,
  id: string,
): RecommendedTool[] {
  return [...byToolId].map(([toolId, stackLabels]) => {
    const tool = toolById.get(toolId);
    if (!tool) {
      throw new CatalogueDataError(
        `The baseline names "${toolId}" for "${id}" (${stackLabels.join(", ")}), but no catalogue tool has that id.`,
      );
    }
    return { id: tool.id, name: tool.name, stackLabels };
  });
}

/** Every stack in `stacks` that expects capability `id` - shared by `analyze()`, `schema.ts` and
 * `apply.ts` so the three can never define "owning stack" differently. */
export function owningStacksFor(
  stacks: BaselineStack[],
  id: string,
): BaselineStack[] {
  return stacks.filter((stack) => stack.expects[id] !== undefined);
}

/** The owning stacks `present` has no tool for - declaratively, by `tool.stacks`, not by what a
 * tool's evidence actually demonstrated. Shared by `evaluateCapability` and `schema.ts`'s rescue
 * candidates, so "still uncovered" means one thing. */
export function uncoveredStacks(
  owningStacks: BaselineStack[],
  present: PresentTool[],
  toolById: Map<string, AnalysisTool>,
): BaselineStack[] {
  return owningStacks.filter(
    (stack) =>
      !present.some((entry) => {
        const tool = toolById.get(entry.id);
        return (
          tool !== undefined &&
          (tool.stacks.includes("any") || tool.stacks.includes(stack.id))
        );
      }),
  );
}

/** The labels of every stack in `owningStacks` that `tool` itself declares. Shared by `analyze()`
 * and `apply.ts`'s rescue, so a newly-credited tool is attributed to stacks the same way a
 * deterministically-detected one is. */
export function stackLabelsFor(
  tool: AnalysisTool,
  owningStacks: BaselineStack[],
): string[] {
  return owningStacks
    .filter((stack) => tool.stacks.includes(stack.id))
    .map((stack) => stack.label);
}

/**
 * Whether `tool` counts toward capability `id` given `owningStacks` - the rule `analyze()` uses to
 * decide which detected tools land in `present`, reused by the LLM pass (`schema.ts`) to find
 * every catalogue entry that could rescue or re-credit a capability, so the two can never
 * recognize a tool differently.
 *
 * `owningStacks` empty means a universal capability: any tool declaring the capability counts,
 * with no stack to match against.
 */
export function toolCreditsCapability(
  tool: AnalysisTool,
  id: string,
  owningStacks: BaselineStack[],
): boolean {
  if (!tool.capabilities.includes(id)) return false;
  return (
    owningStacks.length === 0 ||
    tool.stacks.includes("any") ||
    owningStacks.some((stack) => tool.stacks.includes(stack.id))
  );
}

/**
 * Whether `present` covers every stack in `owningStacks` for capability `id`, and what to
 * recommend when it doesn't. `owningStacks` empty means a universal capability (only reachable
 * via `baseline.universal`, which the real catalogue always leaves empty), checked by presence
 * alone with a generic catalogue-wide fallback recommendation instead of a per-stack one.
 *
 * Also used by `apply.ts` to re-evaluate a capability after the LLM pass adds or removes a
 * present tool, so a capability held up by two tools across different stacks drops to unsatisfied
 * once only one of them remains.
 */
export function evaluateCapability(
  id: string,
  present: PresentTool[],
  owningStacks: BaselineStack[],
  tools: AnalysisTool[],
  toolById: Map<string, AnalysisTool>,
  stackIds: Set<string>,
): { satisfied: boolean; recommended: RecommendedTool[] } {
  if (owningStacks.length === 0) {
    const satisfied = present.length > 0;
    if (satisfied) return { satisfied, recommended: [] };

    // No matched stack's baseline mentions this capability, so fall back to searching every
    // tool generically. A wrapped tool is never itself recommended, and a bundle covering
    // the capability sorts first.
    const wrappedIds = new Set(
      tools.flatMap(
        (tool) =>
          tool.wraps
            ?.filter((entry) => entry.capabilities.includes(id))
            .map((entry) => entry.tool) ?? [],
      ),
    );
    const recommended = tools
      .filter(
        (tool) =>
          tool.capabilities.includes(id) &&
          (tool.stacks.includes("any") ||
            tool.stacks.some((stack) => stackIds.has(stack))) &&
          !wrappedIds.has(tool.id),
      )
      .sort(
        (a, b) => Number(b.wraps !== undefined) - Number(a.wraps !== undefined),
      )
      .map((tool) => ({ id: tool.id, name: tool.name, stackLabels: [] }));
    return { satisfied, recommended };
  }

  const uncovered = uncoveredStacks(owningStacks, present, toolById);
  const satisfied = uncovered.length === 0;
  if (satisfied) return { satisfied, recommended: [] };

  // Each uncovered stack's own baseline entry already names which tool applies here, so there's
  // no need to re-derive stack fit generically like the fallback above.
  const recommended = toRecommendedTools(
    recommendationsByToolId(uncovered, id),
    toolById,
    id,
  );
  // toRecommendedTools always resolves at least one entry per uncovered stack, or throws - this
  // only fires if that guarantee itself breaks.
  if (recommended.length === 0) {
    throw new CatalogueDataError(
      `Capability "${id}" is unsatisfied with tools present but produced no recommendation.`,
    );
  }
  return { satisfied, recommended };
}

/**
 * The whole diff. Deterministic: same snapshot and same catalogue give the same report, with no
 * model in the path. The catalogue and baseline arrive as arguments so this stays independent of
 * where that data is loaded from. `signals` defaults to a fresh parse of `snapshot`; callers that
 * also run the LLM pass on the same snapshot (`run.ts`) pass their own to avoid parsing it twice.
 */
export function analyze(
  snapshot: RepoSnapshot,
  catalogue: { tools: AnalysisTool[]; baseline: Baseline },
  signals?: CiSignals,
): Analysis {
  const { tools, baseline } = catalogue;
  const stacks = detectStacks(snapshot.paths, baseline);
  const detected = detectTools(snapshot, tools, signals);

  const stackIds = new Set(stacks.map((stack) => stack.id));
  const toolById = new Map(tools.map((tool) => [tool.id, tool]));
  const expected = new Set([
    ...baseline.universal,
    ...stacks.flatMap((stack) => Object.keys(stack.expects)),
  ]);

  const reports: CapabilityReport[] = [...expected].map((id) => {
    const meta = baseline.capabilities[id];
    const owningStacks = owningStacksFor(stacks, id);

    // Matching by capability id alone isn't enough: a detected tool can cover this capability
    // for a stack this repo doesn't own (e.g. a nested frontend's ESLint in a Java-only repo).
    // Keeping it in `present` would misreport a fully-missing capability as partially covered.
    const rawPresent = detected.filter((entry) => {
      const tool = toolById.get(entry.id);
      return (
        tool !== undefined && toolCreditsCapability(tool, id, owningStacks)
      );
    });
    const present: PresentTool[] = rawPresent.map((entry) => {
      const tool = toolById.get(entry.id);
      const stackLabels = tool ? stackLabelsFor(tool, owningStacks) : [];
      return { ...entry, stackLabels };
    });

    // A gap names the tools the catalogue would put there, and nothing else. No generated
    // workflow snippet: a snippet that has not been run against the repo is a guess.
    const { satisfied, recommended } = evaluateCapability(
      id,
      present,
      owningStacks,
      tools,
      toolById,
      stackIds,
    );

    return {
      id,
      label: meta?.label ?? id,
      satisfied,
      present,
      recommended,
    };
  });

  const categoryOf = (id: string) =>
    baseline.capabilities[id]?.category ?? "Other";

  const grouped = new Map<string, CapabilityReport[]>();
  for (const report of reports) {
    const category = categoryOf(report.id);
    grouped.set(category, [...(grouped.get(category) ?? []), report]);
  }

  const categories: CategoryReport[] = [...grouped]
    .map(([category, capabilities]) => ({
      category,
      // Gaps first: the report exists to surface what is missing.
      capabilities: capabilities.sort(
        (a, b) =>
          Number(a.satisfied) - Number(b.satisfied) ||
          a.label.localeCompare(b.label),
      ),
    }))
    .sort((a, b) => {
      const order = (category: string) => {
        const index = baseline.categories.indexOf(category);
        return index === -1 ? baseline.categories.length : index;
      };
      return (
        order(a.category) - order(b.category) ||
        a.category.localeCompare(b.category)
      );
    });

  return {
    repo: refLabel(snapshot.ref),
    defaultBranch: snapshot.defaultBranch,
    stacks,
    filesRead: Object.keys(snapshot.files).sort(),
    categories,
    satisfiedCount: reports.filter((report) => report.satisfied).length,
    partialCount: reports.filter(
      (report) => !report.satisfied && report.present.length > 0,
    ).length,
    gapCount: reports.filter((report) => !report.satisfied).length,
    buildSteps: [],
  };
}
