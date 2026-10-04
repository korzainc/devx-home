import { analyze } from "@/lib/gap/analyze";
import type { CiSignals } from "@/lib/gap/detect";
import type { Analysis, AnalysisTool, Baseline } from "@/lib/gap/types";

export type StackSpec = {
  id: string;
  label: string;
  /** capability id -> recommended tool id */
  expects: Record<string, string>;
};

export type Scenario = {
  analysis: Analysis;
  signals: CiSignals;
  catalogue: { tools: AnalysisTool[]; baseline: Baseline };
};

export function tool(
  id: string,
  capabilities: string[],
  options: {
    name?: string;
    stacks?: string[];
    commands?: string[];
    ciUses?: string[];
    configFiles?: string[];
  } = {},
): AnalysisTool {
  return {
    id,
    name: options.name ?? id,
    capabilities,
    stacks: options.stacks ?? ["any"],
    detect: {
      commands: options.commands ?? [id],
      ciUses: options.ciUses,
      configFiles: options.configFiles,
    },
  };
}

export const defaultTools = [
  tool("semgrep", ["sast"]),
  tool("trivy", ["sca", "iac-config", "image-scan"]),
];

const defaultStacks: StackSpec[] = [
  { id: "any", label: "Any", expects: { sast: "semgrep", sca: "trivy" } },
];

/** A real `analyze()` result over a synthetic catalogue. `shell` is what the LLM sees;
 * `deterministic` lists the entries the rule-based pass is allowed to see, so everything else
 * starts as a gap. */
export function scenario(options: {
  tools?: AnalysisTool[];
  stacks?: StackSpec[];
  shell: (string | [text: string, source: string])[];
  uses?: CiSignals["uses"];
  deterministic?: string[];
  paths?: string[];
}): Scenario {
  const tools = options.tools ?? defaultTools;
  const stacks = options.stacks ?? defaultStacks;
  const baseline: Baseline = {
    categories: ["Security"],
    capabilities: Object.fromEntries(
      stacks
        .flatMap((stack) => Object.keys(stack.expects))
        .map((id) => [id, { label: id, category: "Security" }]),
    ),
    universal: [],
    stacks: stacks.map((stack) => ({
      id: stack.id,
      label: stack.label,
      markers: [`${stack.id}.marker`],
      expects: Object.fromEntries(
        Object.entries(stack.expects).map(([id, recommended]) => [
          id,
          { recommended, acceptable: [] },
        ]),
      ),
    })),
  };
  const shell = options.shell.map((entry) =>
    typeof entry === "string"
      ? { text: entry, source: "ci.yml" }
      : { text: entry[0], source: entry[1] },
  );
  const signals: CiSignals = { uses: options.uses ?? [], shell };
  const seen: CiSignals = {
    uses: [],
    shell: shell.filter((entry) =>
      (options.deterministic ?? []).includes(entry.text),
    ),
  };
  const catalogue = { tools, baseline };
  const analysis = analyze(
    {
      ref: { provider: "github", owner: "korza", repo: "example" },
      defaultBranch: "main",
      paths: [
        ...stacks.map((stack) => `${stack.id}.marker`),
        ...(options.paths ?? []),
      ],
      files: {},
    },
    catalogue,
    seen,
  );
  return { analysis, signals, catalogue };
}
