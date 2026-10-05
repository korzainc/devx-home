import { vi } from "vitest";
import { analyze } from "@/lib/gap/analyze";
import type { CiSignals } from "@/lib/gap/detect";
import { buildPrompt } from "@/lib/gap/llm/schema";
import type { LlmConfig, LlmResponse, Verdict } from "@/lib/gap/llm/types";
import type {
  Analysis,
  AnalysisTool,
  Baseline,
  BuildStepKind,
} from "@/lib/gap/types";

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

export type VerdictSpec = {
  pair: string;
  verdict: Verdict;
  quote: string;
  reason?: string;
  /** Substring that finds the cited entry; defaults to the quote. */
  in?: string;
  /** Overrides the lookup, for wrong or unknown ids. */
  signalId?: string;
};
export type DetectSpec = Pick<VerdictSpec, "quote" | "in" | "signalId"> & {
  kind: BuildStepKind;
};

export const provides = (
  pair: string,
  quote: string,
  extra: Partial<VerdictSpec> = {},
): VerdictSpec => ({ pair, verdict: "provides", quote, ...extra });
export const denies = (
  pair: string,
  quote: string,
  reason = "does not cover it",
  extra: Partial<VerdictSpec> = {},
): VerdictSpec => ({
  pair,
  verdict: "does-not-provide",
  quote,
  reason,
  ...extra,
});
/** The signal id a real `buildPrompt` assigned, so tests never hardcode id order. */
function idOf(sc: Scenario, needle: string): string {
  const { signals } = buildPrompt(sc.analysis, sc.signals, sc.catalogue);
  const entry =
    signals.find((e) => e.text === needle) ??
    signals.find((e) => e.text.includes(needle));
  if (!entry) throw new Error(`no signal entry contains "${needle}"`);
  return entry.id;
}

export function llm(response: LlmResponse, costUsd = 0.0042): LlmConfig {
  return {
    enabled: true,
    client: {
      complete: vi.fn().mockResolvedValue({
        ok: true,
        text: JSON.stringify(response),
        inputTokens: 100,
        outputTokens: 50,
        costUsd,
      }),
    },
    model: "claude-sonnet-5-5",
    effort: "low",
    readCache: vi.fn().mockResolvedValue(null),
    writeCache: vi.fn().mockResolvedValue(undefined),
    underDailySpendCap: vi.fn().mockResolvedValue(true),
    recordSpend: vi.fn().mockResolvedValue(undefined),
  };
}

export function responseFor(
  sc: Scenario,
  verdicts: VerdictSpec[],
  detect: DetectSpec[],
): LlmResponse {
  return {
    verdicts: verdicts.map((spec) => ({
      pair: spec.pair,
      verdict: spec.verdict,
      quote: spec.quote,
      reason: spec.reason ?? "",
      signalId: spec.signalId ?? idOf(sc, spec.in ?? spec.quote),
    })),
    detectFindings: detect.map((spec) => ({
      kind: spec.kind,
      quote: spec.quote,
      signalId: spec.signalId ?? idOf(sc, spec.in ?? spec.quote),
    })),
  };
}
