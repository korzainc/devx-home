import type { BuildStepKind } from "../types";

/** Reasoning-depth levels shared across every provider-facing effort field in this module and in
 * `src/lib/gap-llm-config.ts`, so the union is declared once. */
export type LlmEffort = "low" | "medium" | "high" | "xhigh" | "max";

/** One structured-output completion request, provider-agnostic. `schema` is a plain JSON Schema
 * object; `effort` maps onto whichever reasoning-depth control the concrete provider exposes. */
export type LlmCompletionRequest = {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  effort: LlmEffort;
};

export type LlmCompletionResult =
  | {
      ok: true;
      text: string;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }
  | {
      ok: false;
      reason: "truncated" | "refusal" | "error";
      // `costUsd` is set whenever a real cost was or may have been incurred: real usage on a
      // truncated response, or a connection timeout's conservative estimate. Omitted only when
      // the call was rejected before any inference ran.
      inputTokens?: number;
      outputTokens?: number;
      costUsd?: number;
      /** Diagnostic detail for a failed call, logged by `apply.ts` - never the request body or an
       * API key. */
      detail?: {
        status?: number;
        type?: string;
        message?: string;
        requestId?: string;
      };
    };

/** The only surface `apply.ts` calls. Implemented once for the real Anthropic API and once for
 * OpenRouter, so swapping providers for local testing is a config change, never a code change in
 * the orchestrator. Each adapter computes its own `costUsd`, so `apply.ts` never needs to know a
 * model's price or which provider served a response. */
export type LlmClient = {
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResult>;
};

/** Everything the LLM pass needs from outside `src/lib/gap`. Built by the Next-side caller from
 * environment variables and the Postgres-backed store; nothing in this directory reads either
 * directly, matching how `token` and `catalogue` are already passed as arguments. */
export type LlmConfig = {
  enabled: boolean;
  client: LlmClient;
  model: string;
  effort: LlmEffort;
  /** Returns the cached response for a key, or null on a miss. */
  readCache: (key: string) => Promise<CachedLlmResponse | null>;
  /** Persists a fresh response under its key. */
  writeCache: (key: string, entry: CachedLlmResponse) => Promise<void>;
  /** Returns false when today's spend cap has already been reached; the pass is skipped. */
  underDailySpendCap: () => Promise<boolean>;
  /** Records the real cost of a call that was actually made (not a cache hit). */
  recordSpend: (usd: number) => Promise<void>;
};

export type CachedLlmResponse = {
  model: string;
  response: LlmResponse;
  inputTokens: number;
  outputTokens: number;
};

export type Verdict = "provides" | "does-not-provide";

/** One answer to one candidate pair: does the cited CI config actually run `pair`'s tool in a way
 * that provides `pair`'s capability. `pair` is `"<capabilityId>:<toolId>"`, so the model can never
 * mismatch a capability and a tool the way two separately-named fields could. A pair with no
 * clear evidence is omitted from the response entirely rather than given a verdict.
 *
 * `signalId` names exactly one entry from the numbered signal block; `quote` must be verbatim text
 * from that entry only (`guard.ts`'s `verifyQuote`). What a verdict does depends on the pair's
 * fixed direction (`CandidatePair.direction` in `schema.ts`), not on the capability's state when
 * the response arrives: only `provides` on a rescue pair, or `does-not-provide` on an audit pair,
 * changes anything (`apply.ts`). */
export type LlmVerdict = {
  pair: string;
  signalId: string;
  quote: string;
  reason: string;
  verdict: Verdict;
};

export type DetectFinding = {
  kind: BuildStepKind;
  signalId: string;
  quote: string;
};

export type LlmResponse = {
  verdicts: LlmVerdict[];
  detectFindings: DetectFinding[];
};
