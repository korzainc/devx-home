import { detectStacks, detectTools } from "./detect";
import { CatalogueDataError, refLabel } from "./types";
import type {
  Analysis,
  AnalysisTool,
  Baseline,
  BaselineStack,
  CapabilityReport,
  CategoryReport,
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
    const present = detected.filter((entry) =>
      tools.find((tool) => tool.id === entry.id)?.capabilities.includes(id),
    );

    let recommended: RecommendedTool[] = [];
    if (present.length === 0) {
      const ownedByAStack = stacks.some(
        (stack) => stack.expects[id] !== undefined,
      );

      if (ownedByAStack) {
        // The matched stack's baseline already names which tool applies here, so there's no
        // need to re-derive stack fit generically like the fallback below.
        recommended = toRecommendedTools(
          recommendationsByToolId(stacks, id),
          toolById,
          id,
        );
      } else {
        // No matched stack's baseline mentions this capability (only ever a `universal` one,
        // which the real catalogue never populates), so fall back to searching every tool
        // generically. A wrapped tool is never itself recommended, and a bundle covering the
        // capability sorts first.
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
    }

    return {
      id,
      label: meta?.label ?? id,
      satisfied: present.length > 0,
      present,
      // A gap names the tools the catalogue would put there, and nothing else. No generated
      // workflow snippet: a snippet that has not been run against the repo is a guess.
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
    gapCount: reports.filter((report) => !report.satisfied).length,
  };
}
