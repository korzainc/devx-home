import { createHash } from "node:crypto";
import {
  evaluateCapability,
  stackLabelsFor,
  owningStacksFor,
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
  CachedLlmResponse,
  DetectFinding,
  LlmConfig,
  LlmResponse,
  LlmVerdict,
  Verdict,
} from "./types";

const promptVersion = "v3";
const maxQuoteChars = 400;
const maxReasonChars = 300;
const maxDetectFindings = 20;
const maxLoggedChars = 200;

function clip(text: string): string {
  return text.slice(0, maxLoggedChars);
}

function describeError(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${clip(error.message)}`
    : clip(String(error));
}

/** Content-addressed over model, effort, prompt version, schema and exact prompt text, so an
 * unchanged repo hits the cache and any prompt or setting change misses it. The schema is fixed,
 * so its hash only serves as a manual cache-bust lever. */
export function cacheKey(
  model: string,
  effort: string,
  system: string,
  user: string,
  schema: Record<string, unknown>,
): string {
  const schemaHash = createHash("sha256")
    .update(JSON.stringify(schema))
    .digest("hex");
  return createHash("sha256")
    .update(
      `${model}:${effort}:${promptVersion}:${schemaHash}:${system}:${user}`,
    )
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

/** Rejects a response without both arrays (or a `null` body). Items are checked individually by
 * `filterFindings`. Runs on cache hits too, since a stored row is as untrusted as a fresh parse. */
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

/** Keeps only the individually well-formed entries of a findings array. Drops are logged by count
 * only, never with the item itself - a malformed item can still carry repo text via `quote` or
 * `reason`, and logs are not the place for that. */
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

/** Keeps only the well-formed items of a shape-checked response. With no candidate pairs the
 * model has nothing to answer about, so its verdicts are dropped without a warning. */
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

/** Groups verdicts by pair. Identical verdicts on a pair stay together as one group; a pair
 * answered with differing verdicts is dropped, since no verdict is more trustworthy than another
 * and the result must not depend on response order. */
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

function findCapability(
  analysis: Analysis,
  capabilityId: string,
): CapabilityReport | undefined {
  for (const category of analysis.categories) {
    const found = category.capabilities.find((c) => c.id === capabilityId);
    if (found) return found;
  }
  return undefined;
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

/** Context `applyAudit` and `applyRescue` both need to re-evaluate a capability's coverage the
 * same way `analyze()` does, after `present` changes. */
type EvaluationContext = {
  tools: AnalysisTool[];
  toolById: Map<string, AnalysisTool>;
  stacks: BaselineStack[];
};

function joinNotes(existing: string | undefined, note: string): string {
  return existing ? `${existing} ${note}` : note;
}

/** Adds `tool` to `present` and re-runs `evaluateCapability`, so a capability owned by several
 * stacks stays unsatisfied, with a real `recommended` list, when the tool covers only some. */
function applyRescue(
  capability: CapabilityReport,
  evidence: string,
  tool: AnalysisTool,
  context: EvaluationContext,
): CapabilityReport {
  const owningStacks = owningStacksFor(context.stacks, capability.id);
  const present: PresentTool = {
    id: tool.id,
    name: tool.name,
    evidence,
    stackLabels: stackLabelsFor(tool, owningStacks),
  };
  const augmented = [...capability.present, present];
  const stackIds = new Set(context.stacks.map((stack) => stack.id));
  const { satisfied, recommended } = evaluateCapability(
    capability.id,
    augmented,
    owningStacks,
    context.tools,
    context.toolById,
    stackIds,
  );

  return {
    ...capability,
    present: augmented,
    satisfied,
    recommended,
    llmNote: joinNotes(
      capability.llmNote,
      `Rescued by the LLM pass: found ${tool.name} via "${evidence}"`,
    ),
  };
}

/** Removes the demoted tool and re-runs `evaluateCapability`, so a multi-stack capability drops to
 * unsatisfied when a needed stack loses its tool. */
function applyAudit(
  capability: CapabilityReport,
  verdict: LlmVerdict,
  toolId: string,
  context: EvaluationContext,
): CapabilityReport {
  const remaining = capability.present.filter((tool) => tool.id !== toolId);
  const owningStacks = owningStacksFor(context.stacks, capability.id);
  const stackIds = new Set(context.stacks.map((stack) => stack.id));
  const { satisfied, recommended } = evaluateCapability(
    capability.id,
    remaining,
    owningStacks,
    context.tools,
    context.toolById,
    stackIds,
  );

  const reasonChars = Array.from(verdict.reason);
  const reason =
    reasonChars.length > maxReasonChars
      ? `${reasonChars.slice(0, maxReasonChars).join("")}…`
      : verdict.reason;

  return {
    ...capability,
    present: remaining,
    satisfied,
    recommended,
    llmNote: joinNotes(capability.llmNote, toDisplayText(reason)),
  };
}

function recomputeCounts(
  analysis: Analysis,
): Pick<Analysis, "satisfiedCount" | "partialCount" | "gapCount"> {
  const capabilities = analysis.categories.flatMap((c) => c.capabilities);
  return {
    satisfiedCount: capabilities.filter((c) => c.satisfied).length,
    partialCount: capabilities.filter(
      (c) => !c.satisfied && c.present.length > 0,
    ).length,
    gapCount: capabilities.filter((c) => !c.satisfied).length,
  };
}

/** Never lets a bookkeeping failure discard an already-paid-for response - the caller has already
 * decided the cost is real (a success, or a failure that still reports a real cost); this only
 * shields that decision from a store outage. */
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

/** True when every entry related to `tool` reached the model in full. A truncated or omitted entry
 * can hide the argument that changes the verdict, so an audit demotion needs all of them.
 * Compares by escaped text, not id, so omitted entries are caught too. */
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

  // Without signal text a verdict or finding has nothing to quote, so the call cannot help.
  if (sentSignals.length === 0) return analysis;

  const schema = responseSchema();
  const key = cacheKey(config.model, config.effort, system, user, schema);

  // Read before the spend cap check so a capped day still serves cached answers.
  let cached: CachedLlmResponse | null;
  try {
    cached = await config.readCache(key);
  } catch (error) {
    console.error(
      "gap LLM pass: cache read failed, falling back to the deterministic analysis",
      { repo: analysis.repo, error },
    );
    return analysis;
  }

  let response: LlmResponse;
  let callMetrics: CallMetrics | undefined;

  if (cached && isValidLlmResponseShape(cached.response)) {
    response = filterResponse(
      cached.response,
      candidates.length > 0,
      analysis.repo,
    );
  } else {
    // A cached row that fails shape validation is treated as a miss, so the fresh answer
    // overwrites it instead of the row blocking this key for good.
    if (cached) {
      console.warn(
        "gap LLM pass: cached response failed shape validation, bypassing the cache and making a fresh call",
        { repo: analysis.repo },
      );
    }

    try {
      if (!(await config.underDailySpendCap())) {
        console.info("gap LLM pass: skipped, daily spend cap reached", {
          repo: analysis.repo,
        });
        return analysis;
      }
    } catch (error) {
      console.warn(
        "gap LLM pass: underDailySpendCap check failed, treating as over the cap",
        { repo: analysis.repo, error },
      );
      return analysis;
    }

    try {
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
    } catch (error) {
      console.error(
        "gap LLM pass: call failed, falling back to the deterministic analysis",
        { repo: analysis.repo, error: describeError(error) },
      );
      return analysis;
    }
  }

  const evalContext: EvaluationContext = {
    tools: catalogue.tools,
    toolById: new Map(catalogue.tools.map((tool) => [tool.id, tool])),
    stacks: analysis.stacks,
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

    // The pair's fixed direction decides the action: only `provides` on a rescue pair rescues,
    // only `does-not-provide` on an audit pair demotes. Anything else agrees with the
    // deterministic result.
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

  // Candidate order, not response order, so the outcome never depends on how the model sorted
  // its answer.
  pending.sort((a, b) => a.order - b.order);

  let result = analysis;
  for (const { candidate, action, tool, verdict, evidence } of pending) {
    const capability = findCapability(result, candidate.capabilityId);
    if (!capability) {
      verdictsDropped++;
      continue;
    }

    if (action === "rescue") {
      // A capability already closed by an earlier rescue needs no further tool.
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

  return { ...result, buildSteps, ...recomputeCounts(result) };
}
