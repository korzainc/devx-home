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

/** The only surface `apply.ts` calls, with one adapter per provider. Each adapter computes its own
 * `costUsd`. */
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

/** One verdict on a pair (`"<capabilityId>:<toolId>"`), quoting verbatim from the entry `signalId`
 * names. Only `provides` on a rescue pair or `does-not-provide` on an audit pair changes anything. */
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
