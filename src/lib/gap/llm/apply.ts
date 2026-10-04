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
  normalize,
  relatesToTool,
  stripShellComments,
  toDisplayText,
  verifyQuote,
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

/** Content-addressed: same model, same prompt version, same effort, same response schema, and
 * same exact system and user prompt text always maps to the same key, so an unchanged repo hits
 * cache and an edited prompt or changed effort level never serves a stale answer. The schema is
 * fixed across requests (`schema.ts`), so its hash here is a manual cache-bust lever, not a source
 * of real variance. */
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

/** Guards the two application loops below from a response that isn't even the right shape: a
 * missing findings array, or a `null` body. It does not guarantee every individual item is
 * well-formed; `filterFindings` below drops entries that aren't, so one bad item never discards
 * the good ones next to it.
 *
 * Runs on both the cache-hit and fresh-parse paths: a stale or corrupted cache row is exactly as
 * untrusted as a fresh parse. */
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

/** Validates and filters a raw (shape-checked but not item-checked) response into one whose
 * arrays are individually well-formed.
 *
 * An empty `candidates` or `signalIds` list means the model had nothing to answer about; its
 * arrays are expected to be empty too, not a validation error worth logging. */
function filterResponse(
  raw: { verdicts: unknown[]; detectFindings: unknown[] },
  hasCandidates: boolean,
  hasSignals: boolean,
  repo: string,
): LlmResponse {
  return {
    verdicts:
      !hasCandidates || !hasSignals
        ? []
        : filterFindings(raw.verdicts, isValidVerdict, repo, "verdict"),
    detectFindings: !hasSignals
      ? []
      : filterFindings(
          raw.detectFindings,
          isValidDetectFinding,
          repo,
          "detect finding",
        ),
  };
}

/** Drops every pair the response answered more than once, instead of trusting whichever verdict
 * happened to apply last - the resolved action must not depend on response order. Logs once per
 * pair dropped this way. */
function dedupeByPair(verdicts: LlmVerdict[], repo: string): LlmVerdict[] {
  const byPair = new Map<string, LlmVerdict[]>();
  for (const verdict of verdicts) {
    const group = byPair.get(verdict.pair);
    if (group) group.push(verdict);
    else byPair.set(verdict.pair, [verdict]);
  }

  const kept: LlmVerdict[] = [];
  for (const [pair, group] of byPair) {
    if (group.length > 1) {
      console.warn("gap LLM pass: dropped multiple verdicts for one pair", {
        repo,
        pair,
      });
      continue;
    }
    kept.push(group[0]);
  }
  return kept;
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

/** True when `evidence` names a step actually read from CI text (`uses: ...` or `runs ...`), as
 * opposed to a config file or manifest-dependency match (`detect.ts`'s `evidenceFor`). An audit
 * verdict only ever sees CI text, so it must never demote a tool credited the other way. */
function isCiEvidence(evidence: string): boolean {
  return evidence.startsWith("uses: ") || evidence.startsWith("runs ");
}

/** Adds `tool` to `present`, then re-runs `evaluateCapability` against the augmented list instead
 * of crediting the whole capability outright - the pair came from `candidateByPair`, built by
 * `candidatePairsFor` (`schema.ts`) from the same crediting rule `analyze()` uses.
 *
 * A capability owned by more than one stack correctly stays unsatisfied when this tool covers only
 * one of them, with a real `recommended` list naming what's still missing. */
function applyRescue(
  capability: CapabilityReport,
  verdict: LlmVerdict,
  tool: AnalysisTool,
  context: EvaluationContext,
): CapabilityReport {
  const owningStacks = owningStacksFor(context.stacks, capability.id);
  const present: PresentTool = {
    id: tool.id,
    name: tool.name,
    evidence: toDisplayText(verdict.quote),
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
    llmNote: `Rescued by the LLM pass: found ${tool.name} via "${toDisplayText(verdict.quote)}"`,
  };
}

/** After removing the demoted tool from `present`, re-runs `evaluateCapability`, the same
 * stack-coverage rule `analyze()` uses, against the reduced list. A capability held up by two
 * tools across different stacks drops to unsatisfied when only one remains, and `recommended`
 * names what's now missing. */
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

  const reason =
    verdict.reason.length > maxReasonChars
      ? verdict.reason.slice(0, maxReasonChars)
      : verdict.reason;

  return {
    ...capability,
    present: remaining,
    satisfied,
    recommended,
    llmNote: toDisplayText(reason),
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

/** True when every signal entry related to `tool` that was sent to the model arrived in full - a
 * truncated or wholly omitted entry can hide the exact argument that would have changed the
 * verdict, so an audit demotion is skipped rather than trusted on cut context. Compares by the
 * entry's own escaped text, not by id, so it works the same whether the entry survived budgeting
 * or not. */
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
    worthCalling,
  } = buildPrompt(analysis, signals, catalogue);

  // Nothing to rescue, nothing to audit, and no raw signal text at all for detect to search: a
  // call here cannot produce anything useful, so it is never worth the cost (or the risk) of
  // making it. Checked before the spend cap too, since there is no reason to spend a cache/DB
  // round trip on a call that would be a no-op regardless.
  if (!worthCalling) return analysis;

  const signalIds = sentSignals.map((entry) => entry.id);
  const schema = responseSchema();
  const key = cacheKey(config.model, config.effort, system, user, schema);

  // Read before the spend cap check, so a capped day still serves cached answers - a cache hit
  // costs nothing and was already paid for when it was written.
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
  let callMetrics:
    | {
        model: string;
        latencyMs: number;
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
      }
    | undefined;

  if (cached && isValidLlmResponseShape(cached.response)) {
    response = filterResponse(
      cached.response,
      candidates.length > 0,
      signalIds.length > 0,
      analysis.repo,
    );
  } else {
    // A cached row that fails shape validation is treated exactly like a cache miss: warn
    // distinctly (so a poisoned row is diagnosable), then fall through to a fresh call, which
    // overwrites it via the normal writeCache below. Returning early here would make one bad
    // cache write a permanent black hole for this prompt's key.
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
        // `costUsd` is set whenever the adapter has a real or conservatively-estimated cost to
        // report (a truncated response, or an Anthropic connection timeout); omitted only when
        // the call never incurred one.
        if (result.costUsd !== undefined) {
          await recordSpendSafely(config, result.costUsd, analysis.repo);
        }
        return analysis;
      }

      // Recorded immediately: the call is billed the moment it returns, regardless of whether
      // recording, parsing, or caching succeeds afterward - a bookkeeping failure here must never
      // discard an already-paid-for response.
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
      response = filterResponse(
        parsed,
        candidates.length > 0,
        signalIds.length > 0,
        analysis.repo,
      );

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
        { repo: analysis.repo, error },
      );
      return analysis;
    }
  }

  let result = analysis;
  const evalContext: EvaluationContext = {
    tools: catalogue.tools,
    toolById: new Map(catalogue.tools.map((tool) => [tool.id, tool])),
    stacks: analysis.stacks,
  };
  const candidateByPair = new Map(
    candidates.map((candidate): [string, CandidatePair] => [
      candidate.pair,
      candidate,
    ]),
  );
  const signalById = new Map(sentSignals.map((entry) => [entry.id, entry]));

  const verdicts = dedupeByPair(response.verdicts, analysis.repo);
  let verdictsApplied = 0;

  for (const verdict of verdicts) {
    // Re-verified against the candidates this analysis actually generated, never trusted from the
    // response alone - defense in depth against a provider that names a pair outside the prompt.
    const candidate = candidateByPair.get(verdict.pair);
    if (!candidate) {
      console.warn(
        "gap LLM pass: dropped a verdict, pair is not a candidate for this analysis",
        { repo: analysis.repo, pair: verdict.pair },
      );
      continue;
    }
    const capability = findCapability(result, candidate.capabilityId);
    const tool = evalContext.toolById.get(candidate.toolId);
    if (!capability || !tool) continue;

    // The action comes from the pair's fixed direction: only `provides` on a rescue pair can
    // rescue, only `does-not-provide` on an audit pair can demote. A rescue still stops once the
    // capability is satisfied, so a capability with several rescuable tools stops at the first
    // that closes its gap rather than crediting every one.
    const action =
      candidate.direction === "rescue" &&
      verdict.verdict === "provides" &&
      !capability.satisfied
        ? "rescue"
        : candidate.direction === "audit" &&
            verdict.verdict === "does-not-provide"
          ? "audit"
          : null;
    // Every other combination - confirming an already-credited pair, denying a pair that was
    // never credited - changes nothing, and isn't a drop worth logging.
    if (!action) continue;

    const entry = signalById.get(verdict.signalId);
    if (!entry) {
      console.warn(
        `gap LLM pass: dropped the ${action} verdict, signalId is not in this analysis`,
        { repo: analysis.repo, pair: verdict.pair },
      );
      continue;
    }
    if (!verifyQuote(verdict.quote, entry.text)) {
      console.warn(
        `gap LLM pass: dropped the ${action} verdict, quote did not verify`,
        { repo: analysis.repo, pair: verdict.pair },
      );
      continue;
    }
    if (!relatesToTool(stripShellComments(verdict.quote), tool)) {
      console.warn(
        `gap LLM pass: dropped the ${action} verdict, quote does not relate to the tool`,
        { repo: analysis.repo, pair: verdict.pair },
      );
      continue;
    }

    if (action === "rescue") {
      result = updateCapability(result, capability.id, (c) =>
        applyRescue(c, verdict, tool, evalContext),
      );
      verdictsApplied++;
    } else {
      const present = capability.present.find((p) => p.id === tool.id);
      if (present && !isCiEvidence(present.evidence)) {
        console.warn(
          "gap LLM pass: skipped an audit verdict, the tool's credit is not CI text",
          { repo: analysis.repo, pair: verdict.pair },
        );
        continue;
      }
      if (!relatedEntriesUncut(tool, signals, sentSignals)) {
        console.warn(
          "gap LLM pass: skipped an audit verdict, a related signal entry was truncated or omitted",
          { repo: analysis.repo, pair: verdict.pair },
        );
        continue;
      }
      result = updateCapability(result, capability.id, (c) =>
        applyAudit(c, verdict, tool.id, evalContext),
      );
      verdictsApplied++;
    }
  }

  const seenFindings = new Set<string>();
  const dedupedFindings = response.detectFindings.filter((finding) => {
    const key = `${finding.kind}:${finding.signalId}:${normalize(finding.quote)}`;
    if (seenFindings.has(key)) return false;
    seenFindings.add(key);
    return true;
  });

  const buildSteps = dedupedFindings
    .map((finding) => {
      const entry = signalById.get(finding.signalId);
      if (!entry) {
        console.warn(
          "gap LLM pass: dropped a detect finding, signalId is not in this analysis",
          { repo: analysis.repo, kind: finding.kind },
        );
        return null;
      }
      if (!verifyQuote(finding.quote, entry.text)) {
        console.warn(
          "gap LLM pass: dropped a detect finding, quote did not verify",
          { repo: analysis.repo, kind: finding.kind },
        );
        return null;
      }
      return {
        kind: finding.kind,
        evidence: toDisplayText(finding.quote),
        source: entry.rawSource,
      };
    })
    .filter((step): step is NonNullable<typeof step> => step !== null)
    .slice(0, maxDetectFindings);

  if (callMetrics) {
    console.info("gap LLM pass: completed", {
      repo: analysis.repo,
      ...callMetrics,
      verdictsApplied,
      verdictsDropped: verdicts.length - verdictsApplied,
      detectFindingsKept: buildSteps.length,
    });
  }

  return { ...result, buildSteps, ...recomputeCounts(result) };
}
