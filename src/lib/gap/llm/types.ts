import type { BuildStepKind } from "../types";

/** Reasoning-depth levels shared across every provider-facing effort field in this module (and,
 * `src/lib/gap-llm-config.ts`), so the union is declared once. */
export type LlmEffort = "low" | "medium" | "high" | "xhigh" | "max";

/** One structured-output completion request, provider-agnostic. `schema` is a plain JSON Schema
 * object (this plan never uses Zod); `effort` maps onto whichever reasoning-depth control the
 * concrete provider exposes. */
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
      reason: "truncated" | "error";
      // Anthropic bills for a truncated response's tokens exactly as it would a successful one,
      // so a failure with real usage data still has a real cost to record against the daily spend
      // cap. `costUsd` is omitted only when the call never returned usage data and the adapter has
      // no reason to believe a real cost was incurred (e.g. it was rejected before any inference
      // ran) - a connection timeout is the one exception, where the adapter itself estimates a
      // conservative cost since real inference may already be running server-side.
      inputTokens?: number;
      outputTokens?: number;
      costUsd?: number;
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
 * that provides `pair`'s capability. `pair` is a closed enum of `"<capabilityId>:<toolId>"`
 * strings built per analysis, so the model can never mismatch a capability and a tool the way two
 * separately-enumerated fields could. A pair with no clear evidence is omitted from the response
 * entirely rather than given a verdict - omission changes nothing.
 *
 * `signalId` names exactly one entry from the numbered signal block; `quote` must be verbatim text
 * from that entry only (`guard.ts`'s `verifyQuote`). What a verdict actually does depends on the
 * pair's *current* state at apply time (`apply.ts`), never on which direction produced the
 * candidate - a model that confirms existing credit, or denies a gap, changes nothing either way. */
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
