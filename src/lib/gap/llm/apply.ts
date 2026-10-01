import { createHash } from "node:crypto";
import { evaluateCapability } from "../analyze";
import { buildStepKinds } from "../types";
import { warnOnce } from "../warn-once";
import type {
  Analysis,
  AnalysisTool,
  Baseline,
  BaselineStack,
  CapabilityReport,
  PresentTool,
} from "../types";
import type { CiSignals } from "../detect";
import { buildPrompt, responseSchema } from "./schema";
import { escapeSignalText, normalize, verifyQuote } from "./guard";
import type {
  AuditFinding,
  CachedLlmResponse,
  DetectFinding,
  LlmConfig,
  LlmResponse,
  RescueFinding,
} from "./types";

const promptVersion = "v1";

type ModelPricing = { inputUsdPerMillion: number; outputUsdPerMillion: number };

// Per-million-token pricing, keyed by model id. Re-check against Anthropic's published rates
// before shipping: pricing changes independently of this codebase.
//
// Recorded against these constants regardless of which LlmClient adapter ran the call. The
// OpenRouter adapter is local-development-only, where an approximate dollar figure is enough
// since it never faces the daily spend cap in production.
const modelPricing: Record<string, ModelPricing> = {
  "claude-sonnet-5": { inputUsdPerMillion: 2, outputUsdPerMillion: 10 },
};

function costOf(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = pricingFor(model);
  return (
    (inputTokens / 1_000_000) * pricing.inputUsdPerMillion +
    (outputTokens / 1_000_000) * pricing.outputUsdPerMillion
  );
}

/** Never lets a bookkeeping failure discard an already-paid-for response - the caller has already
 * decided the cost is real (a success, or a failure that still reports real token usage); this
 * only shields that decision from a store outage. */
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

/** Falls back to Sonnet 5 pricing for a `config.model` this table doesn't recognize, so spend
 * against an unpriced model is still recorded (approximately) rather than crashing - but only
 * after a one-time warning per distinct unrecognized model id, so a second misconfigured id
 * doesn't mispriced spend with zero signal just because a different id already warned. */
function pricingFor(model: string): ModelPricing {
  const pricing = modelPricing[model];
  if (pricing) return pricing;
  warnOnce(
    `unknown-model:${model}`,
    `gap LLM pass: unrecognized model "${model}", falling back to claude-sonnet-5 pricing - spend may be recorded inaccurately`,
  );
  return modelPricing["claude-sonnet-5"];
}

/** Content-addressed: same model, same prompt version, same effort, same exact system and user
 * prompt text always maps to the same key, so an unchanged repo hits cache and an edited prompt
 * (system or user) or changed effort level never serves a stale answer. */
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

function isValidRescueFinding(item: unknown): item is RescueFinding {
  if (!item || typeof item !== "object") return false;
  const finding = item as Record<string, unknown>;
  return (
    isString(finding.capabilityId) &&
    isString(finding.quote) &&
    isString(finding.toolId)
  );
}

function isValidAuditFinding(item: unknown): item is AuditFinding {
  if (!item || typeof item !== "object") return false;
  const finding = item as Record<string, unknown>;
  return (
    isString(finding.capabilityId) &&
    isString(finding.quote) &&
    isString(finding.toolId) &&
    isString(finding.reason)
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
  return isValidDetectKind(finding.kind) && isString(finding.quote);
}

/** Guards the three application loops below from a response that isn't even the right shape: a
 * missing findings array, or a `null` body. It does not guarantee every individual finding is
 * well-formed; `filterFindings` below drops entries that aren't, so one bad finding never
 * discards the good ones next to it.
 *
 * Runs on both the cache-hit and fresh-parse paths: a stale or corrupted cache row is exactly as
 * untrusted as a fresh parse. */
function isValidLlmResponseShape(value: unknown): value is {
  rescueFindings: unknown[];
  auditFindings: unknown[];
  detectFindings: unknown[];
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.rescueFindings) &&
    Array.isArray(candidate.auditFindings) &&
    Array.isArray(candidate.detectFindings)
  );
}

/** Keeps only the individually well-formed entries of a findings array, logging each one dropped
 * so a poisoned entry is diagnosable without discarding the good findings around it. */
function filterFindings<T>(
  items: unknown[],
  isValid: (item: unknown) => item is T,
  repo: string,
  label: string,
): T[] {
  const valid: T[] = [];
  for (const item of items) {
    if (isValid(item)) {
      valid.push(item);
    } else {
      console.warn(`gap LLM pass: dropped a malformed ${label}`, {
        repo,
        item,
      });
    }
  }
  return valid;
}

/** Validates and filters a raw (shape-checked but not item-checked) response into one whose
 * findings arrays are individually well-formed.
 *
 * `toolIds`/`rescueToolIds` empty is special-cased: `responseSchema` (schema.ts) then forces the
 * model to emit `{}` for that finding kind, since there's no non-empty `toolId` enum to constrain
 * it with, so that shape is expected there, not a validation error worth logging. */
function filterResponse(
  raw: {
    rescueFindings: unknown[];
    auditFindings: unknown[];
    detectFindings: unknown[];
  },
  toolIds: string[],
  rescueToolIds: string[],
  repo: string,
): LlmResponse {
  return {
    rescueFindings:
      rescueToolIds.length === 0
        ? []
        : filterFindings(
            raw.rescueFindings,
            isValidRescueFinding,
            repo,
            "rescue finding",
          ),
    auditFindings:
      toolIds.length === 0
        ? []
        : filterFindings(
            raw.auditFindings,
            isValidAuditFinding,
            repo,
            "audit finding",
          ),
    detectFindings: filterFindings(
      raw.detectFindings,
      isValidDetectFinding,
      repo,
      "detect finding",
    ),
  };
}

/** Escaped the same way `formatSignals` (schema.ts) escapes signal text before it goes into the
 * prompt, so a quote the model copies verbatim (⏎ markers and all) still matches here. */
function sourcesOf(signals: CiSignals): string[] {
  return [
    ...signals.uses.map((e) => escapeSignalText(e.value)),
    ...signals.shell.map((e) => escapeSignalText(e.text)),
  ];
}

/** Whitespace-normalized, matching `verifyQuote` exactly - a quote that only verified because
 * normalization collapsed some whitespace must still resolve to a real source entry here, rather
 * than falling through to the `"unknown"` sentinel. Escaped the same way `sourcesOf` is, so a
 * quote containing a ⏎ marker still resolves to the entry it came from. */
function sourceFileFor(signals: CiSignals, quote: string): string {
  const needle = normalize(quote);
  const hit =
    signals.shell.find((e) =>
      normalize(escapeSignalText(e.text)).includes(needle),
    ) ??
    signals.uses.find((e) =>
      normalize(escapeSignalText(e.value)).includes(needle),
    );
  return hit?.source ?? "unknown";
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

/** Context `applyAudit` and `applyRescue` both need to re-evaluate a capability's coverage the
 * same way `analyze()` does, after `present` changes. */
type EvaluationContext = {
  tools: AnalysisTool[];
  toolById: Map<string, AnalysisTool>;
  stacks: BaselineStack[];
};

/** Adds the real catalogue `tool` (already verified by the caller to be in this capability's own
 * `recommended` list) to `present`, then re-runs `evaluateCapability`, the same stack-coverage
 * rule `analyze()` and `applyAudit` use, against the augmented list instead of crediting the
 * whole capability outright.
 *
 * A capability owned by more than one stack correctly stays unsatisfied when this tool covers
 * only one of them, with a real `recommended` list naming what's still missing. */
function applyRescue(
  capability: CapabilityReport,
  finding: RescueFinding,
  tool: AnalysisTool,
  context: EvaluationContext,
): CapabilityReport {
  const owningStacks = context.stacks.filter(
    (stack) => stack.expects[capability.id] !== undefined,
  );
  const present: PresentTool = {
    id: tool.id,
    name: tool.name,
    evidence: finding.quote,
    stackLabels: owningStacks
      .filter((stack) => tool.stacks.includes(stack.id))
      .map((stack) => stack.label),
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
    llmNote: `Rescued by the LLM pass: found ${tool.name} via "${finding.quote}"`,
  };
}

/** After removing a demoted tool from `present`, re-runs `evaluateCapability`, the same
 * stack-coverage rule `analyze()` uses, against the reduced list. A capability held up by two
 * tools across different stacks drops to unsatisfied when only one remains, and `recommended`
 * names what's now missing.
 *
 * Matches by `finding.toolId`, never by the quote against `PresentTool.evidence`: `evidenceFor`
 * in `detect.ts` only ever synthesizes a label, never raw CI text, so the two never match. A
 * `toolId` not present on this capability leaves it untouched, with no `llmNote`. */
function applyAudit(
  capability: CapabilityReport,
  finding: AuditFinding,
  context: EvaluationContext,
): CapabilityReport {
  const remaining = capability.present.filter(
    (tool) => tool.id !== finding.toolId,
  );
  if (remaining.length === capability.present.length) return capability;

  const owningStacks = context.stacks.filter(
    (stack) => stack.expects[capability.id] !== undefined,
  );
  const stackIds = new Set(context.stacks.map((stack) => stack.id));
  const { satisfied, recommended } = evaluateCapability(
    capability.id,
    remaining,
    owningStacks,
    context.tools,
    context.toolById,
    stackIds,
  );

  return {
    ...capability,
    present: remaining,
    satisfied,
    recommended,
    llmNote: finding.reason,
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
    capabilityIds,
    toolIds,
    rescueToolIds,
    cappedSignals,
    hasCandidates,
  } = buildPrompt(analysis, signals, catalogue);

  // Nothing to rescue and nothing to audit: a call here cannot produce anything useful, so it is
  // never worth the cost (or the risk) of making it. Checked before the spend cap too, since
  // there is no reason to spend a cache/DB round trip on a call that would be a no-op regardless.
  if (!hasCandidates) return analysis;

  try {
    if (!(await config.underDailySpendCap())) return analysis;
  } catch (error) {
    console.warn(
      "gap LLM pass: underDailySpendCap check failed, treating as over the cap",
      { repo: analysis.repo, error },
    );
    return analysis;
  }

  const sources = sourcesOf(cappedSignals);
  const key = cacheKey(config.model, config.effort, system, user);

  // Isolated from the fetch/parse try below so a cache backend failure logs distinctly from a
  // real API-call failure - the two are different failure domains and shouldn't read the same in
  // the logs.
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
  if (cached && isValidLlmResponseShape(cached.response)) {
    response = filterResponse(
      cached.response,
      toolIds,
      rescueToolIds,
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
      const result = await config.client.complete({
        system,
        user,
        schema: responseSchema(capabilityIds, toolIds, rescueToolIds),
        effort: config.effort,
      });

      if (!result.ok) {
        console.warn(
          `gap LLM pass: call did not succeed (${result.reason}), discarding`,
          {
            repo: analysis.repo,
          },
        );
        // A truncated response (or any failure that still returned usage data) was fully paid
        // for: Anthropic bills for tokens generated up to `max_tokens` regardless of whether the
        // response was usable. Skipping this would let a misconfigured effort level that reliably
        // truncates run up unbounded, unrecorded spend invisible to the daily cap.
        //
        // `inputTokens`/`outputTokens` are omitted only when the call threw before usage data
        // existed, where there is genuinely nothing to record.
        if (
          result.inputTokens !== undefined &&
          result.outputTokens !== undefined
        ) {
          const cost = costOf(
            config.model,
            result.inputTokens,
            result.outputTokens,
          );
          await recordSpendSafely(config, cost, analysis.repo);
        }
        return analysis;
      }

      // Recorded immediately: the call is billed the moment it returns, regardless of whether
      // recording, parsing, or caching succeeds afterward - a bookkeeping failure here must never
      // discard an already-paid-for response.
      await recordSpendSafely(
        config,
        costOf(config.model, result.inputTokens, result.outputTokens),
        analysis.repo,
      );

      const parsed = JSON.parse(result.text) as unknown;
      if (!isValidLlmResponseShape(parsed)) {
        console.warn(
          "gap LLM pass: response failed shape validation, falling back to the deterministic analysis",
          { repo: analysis.repo },
        );
        return analysis;
      }
      response = filterResponse(parsed, toolIds, rescueToolIds, analysis.repo);

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
        {
          repo: analysis.repo,
          error,
        },
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

  for (const finding of response.rescueFindings) {
    if (!verifyQuote(finding.quote, sources)) {
      console.warn(
        "gap LLM pass: dropped a rescue finding, quote did not verify",
        {
          repo: analysis.repo,
          capabilityId: finding.capabilityId,
          toolId: finding.toolId,
        },
      );
      continue;
    }
    const capability = findCapability(result, finding.capabilityId);
    if (!capability || capability.present.length !== 0) {
      console.warn(
        "gap LLM pass: dropped a rescue finding, capability is not an open gap",
        {
          repo: analysis.repo,
          capabilityId: finding.capabilityId,
          toolId: finding.toolId,
        },
      );
      continue;
    }
    // Re-verified here, not just trusted from the schema's global enum - the schema's `toolId`
    // enum spans every gap's recommendations across this whole analysis, so it alone cannot rule
    // out a tool that is real but recommended for a *different* capability, exactly the same
    // defensive shape `applyAudit` already applies to its own `toolId`.
    const recommendedTool = capability.recommended.find(
      (candidate) => candidate.id === finding.toolId,
    );
    const tool = recommendedTool && evalContext.toolById.get(finding.toolId);
    if (!recommendedTool || !tool) {
      console.warn(
        "gap LLM pass: dropped a rescue finding, toolId did not match a recommended tool for this capability",
        {
          repo: analysis.repo,
          capabilityId: finding.capabilityId,
          toolId: finding.toolId,
        },
      );
      continue;
    }
    result = {
      ...result,
      categories: result.categories.map((category) => ({
        ...category,
        capabilities: category.capabilities.map((c) =>
          c.id === finding.capabilityId && c.present.length === 0
            ? applyRescue(c, finding, tool, evalContext)
            : c,
        ),
      })),
    };
  }

  for (const finding of response.auditFindings) {
    if (!verifyQuote(finding.quote, sources)) {
      console.warn(
        "gap LLM pass: dropped an audit finding, quote did not verify",
        {
          repo: analysis.repo,
          capabilityId: finding.capabilityId,
          toolId: finding.toolId,
        },
      );
      continue;
    }
    const capability = findCapability(result, finding.capabilityId);
    if (!capability || !capability.satisfied) {
      console.warn(
        "gap LLM pass: dropped an audit finding, capability is not currently satisfied",
        {
          repo: analysis.repo,
          capabilityId: finding.capabilityId,
          toolId: finding.toolId,
        },
      );
      continue;
    }
    if (!capability.present.some((tool) => tool.id === finding.toolId)) {
      console.warn(
        "gap LLM pass: dropped an audit finding, toolId did not match any present tool",
        {
          repo: analysis.repo,
          capabilityId: finding.capabilityId,
          toolId: finding.toolId,
        },
      );
      continue;
    }
    result = {
      ...result,
      categories: result.categories.map((category) => ({
        ...category,
        capabilities: category.capabilities.map((capability) =>
          capability.id === finding.capabilityId && capability.satisfied
            ? applyAudit(capability, finding, evalContext)
            : capability,
        ),
      })),
    };
  }

  const buildSteps = response.detectFindings
    .filter((finding: DetectFinding) => {
      const verified = verifyQuote(finding.quote, sources);
      if (!verified) {
        console.warn(
          "gap LLM pass: dropped a detect finding, quote did not verify",
          {
            repo: analysis.repo,
            kind: finding.kind,
          },
        );
      }
      return verified;
    })
    .map((finding) => ({
      kind: finding.kind,
      evidence: finding.quote,
      source: sourceFileFor(cappedSignals, finding.quote),
    }));

  return { ...result, buildSteps, ...recomputeCounts(result) };
}
