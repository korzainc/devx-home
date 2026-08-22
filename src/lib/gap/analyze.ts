import { detectStacks, detectTools } from "./detect";
import type {
  Analysis,
  AnalysisTool,
  Baseline,
  CapabilityReport,
  CategoryReport,
  RepoSnapshot,
} from "./types";

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
  const expected = new Set([
    ...baseline.universal,
    ...stacks.flatMap((stack) => stack.expects),
  ]);

  const reports: CapabilityReport[] = [...expected].map((id) => {
    const meta = baseline.capabilities[id];
    const present = detected.filter((entry) =>
      tools.find((tool) => tool.id === entry.id)?.capabilities.includes(id),
    );

    return {
      id,
      label: meta?.label ?? id,
      satisfied: present.length > 0,
      present,
      // A gap names the tools the catalogue would put there, and nothing else. No generated
      // workflow snippet: a snippet that has not been run against the repo is a guess.
      recommended:
        present.length > 0
          ? []
          : tools
              .filter(
                (tool) =>
                  tool.capabilities.includes(id) &&
                  (tool.stacks.includes("any") ||
                    tool.stacks.some((stack) => stackIds.has(stack))),
              )
              .map((tool) => ({ id: tool.id, name: tool.name })),
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
    repo: `${snapshot.ref.owner}/${snapshot.ref.repo}`,
    defaultBranch: snapshot.defaultBranch,
    stacks,
    filesRead: Object.keys(snapshot.files).sort(),
    categories,
    satisfiedCount: reports.filter((report) => report.satisfied).length,
    gapCount: reports.filter((report) => !report.satisfied).length,
  };
}
