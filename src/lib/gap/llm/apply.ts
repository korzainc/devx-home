import { createHash } from "node:crypto";
import {
  countCapabilities,
  evaluateCapability,
  findCapability,
  owningStacksFor,
  stackLabelsFor,
} from "../analyze";
import { buildStepKinds } from "../types";
import type {
  Analysis,
  AnalysisTool,
  Baseline,
  BaselineStack,
  CapabilityReport,
  PresentTool,
} from "../types";
import type { CiSignals } from "../detect";
import { buildPrompt, responseSchema, toRawEntries } from "./schema";
import type { CandidatePair } from "./schema";
import {
  escapeSignalText,
  relatesToTool,
  toDisplayText,
  verifiedQuote,
} from "./guard";
import type { IndexedSignal } from "./guard";
import type {
  DetectFinding,
  LlmConfig,
  LlmResponse,
  LlmVerdict,
  Verdict,
} from "./types";

// Bump when the key format changes, so stale entries miss.
const promptVersion = "v4";
const maxQuoteChars = 400;
const maxReasonChars = 300;
const maxDetectFindings = 20;
const maxLoggedChars = 200;

function clip(text: string): string {
  return text.slice(0, maxLoggedChars);
}

/** Content-addressed over model, effort, prompt version and exact prompt text, so an unchanged
 * repo hits the cache and any prompt or setting change misses it. */
export function cacheKey(
  model: string,
  effort: string,
  system: string,
  user: string,
): string {
  return createHash("sha256")
    .update(`${model}:${effort}:${promptVersion}:${system}:${user}`)
    .digest("hex");
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

const verdictValues = new Set<Verdict>(["provides", "does-not-provide"]);

function isValidVerdict(item: unknown): item is LlmVerdict {
  if (!item || typeof item !== "object") return false;
  const verdict = item as Record<string, unknown>;
  return (
    isString(verdict.pair) &&
    isString(verdict.signalId) &&
    isString(verdict.quote) &&
    verdict.quote.length <= maxQuoteChars &&
    isString(verdict.reason) &&
    isString(verdict.verdict) &&
    verdictValues.has(verdict.verdict as Verdict)
  );
}

const detectFindingKinds = new Set<DetectFinding["kind"]>(buildStepKinds);

function isValidDetectKind(value: unknown): value is DetectFinding["kind"] {
  return (
    isString(value) && detectFindingKinds.has(value as DetectFinding["kind"])
  );
}

function isValidDetectFinding(item: unknown): item is DetectFinding {
  if (!item || typeof item !== "object") return false;
  const finding = item as Record<string, unknown>;
  return (
    isValidDetectKind(finding.kind) &&
    isString(finding.signalId) &&
    isString(finding.quote) &&
    finding.quote.length <= maxQuoteChars
  );
}

/** Rejects a response without both arrays. Runs on cache hits too: a stored row is as untrusted
 * as a fresh parse. */
function isValidLlmResponseShape(value: unknown): value is {
  verdicts: unknown[];
  detectFindings: unknown[];
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.verdicts) && Array.isArray(candidate.detectFindings)
  );
}

/** Keeps the well-formed items. Drops are logged by count only: a malformed item can still carry
 * repo text. */
function filterFindings<T>(
  items: unknown[],
  isValid: (item: unknown) => item is T,
  repo: string,
  label: string,
): T[] {
  const valid: T[] = [];
  let dropped = 0;
  for (const item of items) {
    if (isValid(item)) valid.push(item);
    else dropped++;
  }
  if (dropped > 0) {
    console.warn(`gap LLM pass: dropped ${dropped} malformed ${label}(s)`, {
      repo,
    });
  }
  return valid;
}

/** With no candidate pairs the model has nothing to answer, so its verdicts are dropped silently. */
function filterResponse(
  raw: { verdicts: unknown[]; detectFindings: unknown[] },
  hasPairs: boolean,
  repo: string,
): LlmResponse {
  return {
    verdicts: hasPairs
      ? filterFindings(raw.verdicts, isValidVerdict, repo, "verdict")
      : [],
    detectFindings: filterFindings(
      raw.detectFindings,
      isValidDetectFinding,
      repo,
      "detect finding",
    ),
  };
}

/** Groups verdicts by pair. A pair answered with differing verdicts is dropped, so the result
 * never depends on response order. */
function groupByPair(
  verdicts: LlmVerdict[],
  repo: string,
): { groups: LlmVerdict[][]; dropped: number } {
  const byPair = new Map<string, LlmVerdict[]>();
  for (const verdict of verdicts) {
    const group = byPair.get(verdict.pair);
    if (group) group.push(verdict);
    else byPair.set(verdict.pair, [verdict]);
  }

  const groups: LlmVerdict[][] = [];
  let dropped = 0;
  for (const [pair, group] of byPair) {
    if (new Set(group.map((verdict) => verdict.verdict)).size > 1) {
      console.warn("gap LLM pass: dropped conflicting verdicts for one pair", {
        repo,
        pair: clip(pair),
      });
      dropped += group.length;
    } else {
      groups.push(group);
    }
  }
  return { groups, dropped };
}

function updateCapability(
  analysis: Analysis,
  capabilityId: string,
  update: (capability: CapabilityReport) => CapabilityReport,
): Analysis {
  return {
    ...analysis,
    categories: analysis.categories.map((category) => ({
      ...category,
      capabilities: category.capabilities.map((capability) =>
        capability.id === capabilityId ? update(capability) : capability,
      ),
    })),
  };
}

type EvaluationContext = {
  tools: AnalysisTool[];
  toolById: Map<string, AnalysisTool>;
  stacks: BaselineStack[];
  stackIds: Set<string>;
};

function joinNotes(existing: string | undefined, note: string): string {
  return existing ? `${existing} ${note}` : note;
}

/** Swaps in `present` and re-runs `evaluateCapability`, so a capability owned by several stacks is
 * satisfied only when every stack is covered. */
function reevaluate(
  capability: CapabilityReport,
  present: PresentTool[],
  context: EvaluationContext,
): CapabilityReport {
  const { satisfied, recommended } = evaluateCapability(
    capability.id,
    present,
    owningStacksFor(context.stacks, capability.id),
    context.tools,
    context.toolById,
    context.stackIds,
  );
  return { ...capability, present, satisfied, recommended };
}

function applyRescue(
  capability: CapabilityReport,
  evidence: string,
  tool: AnalysisTool,
  context: EvaluationContext,
): CapabilityReport {
  const added: PresentTool = {
    id: tool.id,
    name: tool.name,
    evidence,
    stackLabels: stackLabelsFor(
      tool,
      owningStacksFor(context.stacks, capability.id),
    ),
  };
  return {
    ...reevaluate(capability, [...capability.present, added], context),
    llmNote: joinNotes(
      capability.llmNote,
      `Rescued by the LLM pass: found ${tool.name} via "${evidence}"`,
    ),
  };
}

function applyAudit(
  capability: CapabilityReport,
  verdict: LlmVerdict,
  toolId: string,
  context: EvaluationContext,
): CapabilityReport {
  const remaining = capability.present.filter((tool) => tool.id !== toolId);
  const reasonChars = Array.from(verdict.reason);
  const reason =
    reasonChars.length > maxReasonChars
      ? `${reasonChars.slice(0, maxReasonChars).join("")}…`
      : verdict.reason;
  return {
    ...reevaluate(capability, remaining, context),
    llmNote: joinNotes(capability.llmNote, toDisplayText(reason)),
  };
}

/** A store outage must not discard a response that was already paid for. */
async function recordSpendSafely(
  config: LlmConfig,
  cost: number,
  repo: string,
): Promise<void> {
  try {
    await config.recordSpend(cost);
  } catch (error) {
    console.error(
      "gap LLM pass: recordSpend failed, continuing with the response anyway",
      { repo, cost, error },
    );
  }
}

/** True when every entry related to `tool` reached the model in full: a cut entry can hide what
 * changes the verdict. Compares by text, not id, so omitted entries count as cut. */
function relatedEntriesUncut(
  tool: AnalysisTool,
  signals: CiSignals,
  sent: IndexedSignal[],
): boolean {
  const uncut = new Set(
    sent.filter((entry) => !entry.truncated).map((entry) => entry.text),
  );
  return toRawEntries(signals)
    .filter((entry) => relatesToTool(entry.text, tool))
    .every((entry) => uncut.has(escapeSignalText(entry.text)));
}

type CallMetrics = {
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

type PendingVerdict = {
  order: number;
  candidate: CandidatePair;
  action: "rescue" | "audit";
  tool: AnalysisTool;
  verdict: LlmVerdict;
  evidence: string;
};

/** Returns `analysis` untouched when the pass can't help. Unexpected failures (store or client
 * errors, unparsable output) throw, and `runAnalysis` falls back on them. */
export async function applyLlmPass(
  analysis: Analysis,
  signals: CiSignals,
  catalogue: { tools: AnalysisTool[]; baseline: Baseline },
  config: LlmConfig,
): Promise<Analysis> {
  if (!config.enabled) return analysis;

  const {
    system,
    user,
    candidates,
    signals: sentSignals,
  } = buildPrompt(analysis, signals, catalogue);

  // With no signal text there is nothing to quote.
  if (sentSignals.length === 0) return analysis;

  const schema = responseSchema();
  const key = cacheKey(config.model, config.effort, system, user);

  // Read before the spend cap check so a capped day still serves cached answers.
  const cached = await config.readCache(key);

  let response: LlmResponse;
  let callMetrics: CallMetrics | undefined;

  if (cached && isValidLlmResponseShape(cached.response)) {
    response = filterResponse(
      cached.response,
      candidates.length > 0,
      analysis.repo,
    );
  } else {
    // A cached row that fails shape validation counts as a miss, so the fresh answer overwrites
    // it instead of the row blocking this key for good.
    if (cached) {
      console.warn(
        "gap LLM pass: cached response failed shape validation, bypassing the cache and making a fresh call",
        { repo: analysis.repo },
      );
    }

    if (!(await config.underDailySpendCap())) {
      console.info("gap LLM pass: skipped, daily spend cap reached", {
        repo: analysis.repo,
      });
      return analysis;
    }

    const callStart = Date.now();
    const result = await config.client.complete({
      system,
      user,
      schema,
      effort: config.effort,
    });
    const latencyMs = Date.now() - callStart;

    if (!result.ok) {
      console.warn(`gap LLM pass: call did not succeed (${result.reason})`, {
        repo: analysis.repo,
        detail: result.detail,
      });
      // Set whenever the adapter has a real or estimated cost to report.
      if (result.costUsd !== undefined) {
        await recordSpendSafely(config, result.costUsd, analysis.repo);
      }
      return analysis;
    }

    // Billed the moment the call returns, so recorded before anything that can fail.
    await recordSpendSafely(config, result.costUsd, analysis.repo);
    callMetrics = {
      model: config.model,
      latencyMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
    };

    const parsed = JSON.parse(result.text) as unknown;
    if (!isValidLlmResponseShape(parsed)) {
      console.warn(
        "gap LLM pass: response failed shape validation, falling back to the deterministic analysis",
        { repo: analysis.repo },
      );
      return analysis;
    }
    response = filterResponse(parsed, candidates.length > 0, analysis.repo);

    try {
      await config.writeCache(key, {
        model: config.model,
        response,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
    } catch (error) {
      console.error(
        "gap LLM pass: writeCache failed, continuing with the response anyway",
        { repo: analysis.repo, error },
      );
    }
  }

  const evalContext: EvaluationContext = {
    tools: catalogue.tools,
    toolById: new Map(catalogue.tools.map((tool) => [tool.id, tool])),
    stacks: analysis.stacks,
    stackIds: new Set(analysis.stacks.map((stack) => stack.id)),
  };
  const candidateOrder = new Map(
    candidates.map((candidate, index): [string, number] => [
      candidate.pair,
      index,
    ]),
  );
  const signalById = new Map(sentSignals.map((entry) => [entry.id, entry]));

  let verdictsApplied = 0;
  let verdictsNoop = 0;
  let verdictsDropped = 0;

  const { groups, dropped: conflicting } = groupByPair(
    response.verdicts,
    analysis.repo,
  );
  verdictsDropped += conflicting;

  const pending: PendingVerdict[] = [];
  for (const group of groups) {
    const pair = clip(group[0].pair);
    const order = candidateOrder.get(group[0].pair);
    const candidate = order === undefined ? undefined : candidates[order];
    const tool = candidate && evalContext.toolById.get(candidate.toolId);
    if (order === undefined || !candidate || !tool) {
      console.warn(
        "gap LLM pass: dropped a verdict, pair is not a candidate for this analysis",
        { repo: analysis.repo, pair },
      );
      verdictsDropped += group.length;
      continue;
    }

    // Only `provides` on a rescue pair rescues and only `does-not-provide` on an audit pair
    // demotes. Anything else agrees with the deterministic result.
    const action =
      candidate.direction === "rescue" && group[0].verdict === "provides"
        ? "rescue"
        : candidate.direction === "audit" &&
            group[0].verdict === "does-not-provide"
          ? "audit"
          : null;
    if (!action) {
      verdictsNoop += group.length;
      continue;
    }

    let failure: string | undefined;
    let accepted: { verdict: LlmVerdict; evidence: string } | undefined;
    for (const verdict of group) {
      const entry = signalById.get(verdict.signalId);
      if (!entry) {
        failure ??= "signalId is not in this analysis";
        continue;
      }
      const quote = verifiedQuote(verdict.quote, entry);
      if (quote === null) {
        failure ??= "quote did not verify";
        continue;
      }
      if (!relatesToTool(quote, tool)) {
        failure ??= "quote does not relate to the tool";
        continue;
      }
      accepted = {
        verdict,
        evidence: toDisplayText(quote, entry.truncated),
      };
      break;
    }
    if (!accepted) {
      console.warn(`gap LLM pass: dropped the ${action} verdict, ${failure}`, {
        repo: analysis.repo,
        pair,
      });
      verdictsDropped += group.length;
      continue;
    }
    // Repeats of the accepted verdict add nothing.
    verdictsNoop += group.length - 1;
    pending.push({ order, candidate, action, tool, ...accepted });
  }

  // Candidate order, so the outcome never depends on how the model ordered its answer.
  pending.sort((a, b) => a.order - b.order);

  let result = analysis;
  for (const { candidate, action, tool, verdict, evidence } of pending) {
    const capability = findCapability(result, candidate.capabilityId);
    if (!capability) {
      verdictsDropped++;
      continue;
    }

    if (action === "rescue") {
      // An earlier rescue already closed this capability.
      if (capability.satisfied) {
        verdictsNoop++;
        continue;
      }
      result = updateCapability(result, capability.id, (c) =>
        applyRescue(c, evidence, tool, evalContext),
      );
      verdictsApplied++;
      continue;
    }

    const present = capability.present.find((p) => p.id === tool.id);
    if (!present) {
      verdictsNoop++;
      continue;
    }
    if (present.nonCiCredit) {
      console.warn(
        "gap LLM pass: skipped an audit verdict, the tool is also credited by a config file or dependency",
        { repo: analysis.repo, pair: clip(verdict.pair) },
      );
      verdictsDropped++;
      continue;
    }
    if (!relatedEntriesUncut(tool, signals, sentSignals)) {
      console.warn(
        "gap LLM pass: skipped an audit verdict, a related signal entry was truncated or omitted",
        { repo: analysis.repo, pair: clip(verdict.pair) },
      );
      verdictsDropped++;
      continue;
    }
    result = updateCapability(result, capability.id, (c) =>
      applyAudit(c, verdict, tool.id, evalContext),
    );
    verdictsApplied++;
  }

  const seenFindings = new Set<string>();
  const buildSteps: Analysis["buildSteps"] = [];
  for (const finding of response.detectFindings) {
    const entry = signalById.get(finding.signalId);
    const quote = entry && verifiedQuote(finding.quote, entry);
    if (!entry || quote === null || quote === undefined) {
      console.warn("gap LLM pass: dropped a detect finding", {
        repo: analysis.repo,
        kind: finding.kind,
        reason: entry
          ? "quote did not verify"
          : "signalId is not in this analysis",
      });
      continue;
    }
    // One finding per kind per source file.
    const findingKey = `${finding.kind}:${entry.rawSource}`;
    if (seenFindings.has(findingKey)) continue;
    seenFindings.add(findingKey);
    buildSteps.push({
      kind: finding.kind,
      evidence: toDisplayText(quote, entry.truncated),
      source: entry.rawSource,
    });
    if (buildSteps.length === maxDetectFindings) break;
  }

  const counts = {
    verdictsApplied,
    verdictsNoop,
    verdictsDropped,
    detectFindingsKept: buildSteps.length,
  };
  if (callMetrics) {
    console.info("gap LLM pass: completed", {
      repo: analysis.repo,
      ...callMetrics,
      ...counts,
    });
  } else {
    console.info("gap LLM pass: served from cache", {
      repo: analysis.repo,
      ...counts,
    });
  }

  return {
    ...result,
    buildSteps,
    ...countCapabilities(result.categories.flatMap((c) => c.capabilities)),
  };
}
