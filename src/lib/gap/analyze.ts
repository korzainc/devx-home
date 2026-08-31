import { detectStacks, detectTools } from "./detect";
import { refLabel } from "./types";
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

/** Every matched stack's own recommended tool id for one capability, deduped, first-seen order.
 * `acceptable` alternatives exist in the baseline but aren't surfaced here: the report only
 * names the recommendation. More than one stack can contribute one; a repo matching both
 * `javascript` and `go` wants jest for its JS half and go-test for its Go half, neither taking
 * priority over the other. */
function recommendedToolIds(stacks: BaselineStack[], id: string) {
  const recommendedIds: string[] = [];
  let ownedByAStack = false;

  for (const stack of stacks) {
    const entry = stack.expects[id];
    if (!entry) continue;
    ownedByAStack = true;

    if (!recommendedIds.includes(entry.recommended)) {
      recommendedIds.push(entry.recommended);
    }
  }

  return { ownedByAStack, recommendedIds };
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
      const { ownedByAStack, recommendedIds } = recommendedToolIds(stacks, id);

      if (ownedByAStack) {
        // The matched stack's baseline already names which tool applies here, so there's no
        // need to re-derive stack fit generically like the fallback below.
        recommended = recommendedIds.flatMap((toolId) => {
          const tool = toolById.get(toolId);
          return tool ? [{ id: tool.id, name: tool.name }] : [];
        });
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
          .map((tool) => ({ id: tool.id, name: tool.name }));
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
