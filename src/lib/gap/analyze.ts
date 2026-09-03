import { detectStacks, detectTools } from "./detect";
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

/**
 * The whole diff. Deterministic: same snapshot and same catalogue give the same report, with no
 * model in the path. The catalogue and baseline arrive as arguments so this stays independent of
 * where that data is loaded from.
 */
export function analyze(
  snapshot: RepoSnapshot,
  catalogue: { tools: AnalysisTool[]; baseline: Baseline },
): Analysis {
  const { tools, baseline } = catalogue;
  const stacks = detectStacks(snapshot.paths, baseline);
  const detected = detectTools(snapshot, tools);

  const stackIds = new Set(stacks.map((stack) => stack.id));
  const toolById = new Map(tools.map((tool) => [tool.id, tool]));
  const expected = new Set([
    ...baseline.universal,
    ...stacks.flatMap((stack) => Object.keys(stack.expects)),
  ]);

  const reports: CapabilityReport[] = [...expected].map((id) => {
    const meta = baseline.capabilities[id];
    const owningStacks = stacks.filter(
      (stack) => stack.expects[id] !== undefined,
    );

    // Matching by capability id alone isn't enough: a detected tool can cover this capability
    // for a stack this repo doesn't own (e.g. a nested frontend's ESLint in a Java-only repo).
    // Keeping it in `present` would misreport a fully-missing capability as partially covered.
    const rawPresent = detected.filter((entry) => {
      const tool = toolById.get(entry.id);
      if (!tool?.capabilities.includes(id)) return false;
      return (
        owningStacks.length === 0 ||
        tool.stacks.includes("any") ||
        owningStacks.some((stack) => tool.stacks.includes(stack.id))
      );
    });
    const present: PresentTool[] = rawPresent.map((entry) => {
      const tool = toolById.get(entry.id);
      const stackLabels = owningStacks
        .filter((stack) => tool?.stacks.includes(stack.id))
        .map((stack) => stack.label);
      return { ...entry, stackLabels };
    });

    let satisfied: boolean;
    // A gap names the tools the catalogue would put there, and nothing else. No generated
    // workflow snippet: a snippet that has not been run against the repo is a guess.
    let recommended: RecommendedTool[] = [];

    if (owningStacks.length === 0) {
      // Only reachable via `baseline.universal`, which the real catalogue always leaves empty:
      // there's no stack dimension to check partial coverage against.
      satisfied = present.length > 0;
      if (!satisfied) {
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
        recommended = tools
          .filter(
            (tool) =>
              tool.capabilities.includes(id) &&
              (tool.stacks.includes("any") ||
                tool.stacks.some((stack) => stackIds.has(stack))) &&
              !wrappedIds.has(tool.id),
          )
          .sort(
            (a, b) =>
              Number(b.wraps !== undefined) - Number(a.wraps !== undefined),
          )
          .map((tool) => ({ id: tool.id, name: tool.name, stackLabels: [] }));
      }
    } else {
      const uncoveredStacks = owningStacks.filter(
        (stack) =>
          !present.some((entry) => {
            const tool = toolById.get(entry.id);
            return (
              tool !== undefined &&
              (tool.stacks.includes("any") || tool.stacks.includes(stack.id))
            );
          }),
      );
      satisfied = uncoveredStacks.length === 0;
      if (!satisfied) {
        // Each uncovered stack's own baseline entry already names which tool applies here, so
        // there's no need to re-derive stack fit generically like the fallback above.
        recommended = toRecommendedTools(
          recommendationsByToolId(uncoveredStacks, id),
          toolById,
          id,
        );
        // toRecommendedTools always resolves at least one entry per uncovered stack, or throws -
        // this only fires if that guarantee itself breaks.
        if (recommended.length === 0) {
          throw new CatalogueDataError(
            `Capability "${id}" is unsatisfied with tools present but produced no recommendation.`,
          );
        }
      }
    }

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
  };
}
