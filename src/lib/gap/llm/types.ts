import type { BuildStepKind } from "../types";

/** Reasoning-depth levels, mapped onto each provider's own control. */
export type LlmEffort = "low" | "medium" | "high" | "xhigh" | "max";

/** One structured-output completion request. `schema` is a plain JSON Schema object. */
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
      // `costUsd` is set whenever a cost was or may have been incurred: real usage on a truncated
      // response, or a timeout's estimate. Omitted when the call was rejected before inference.
      inputTokens?: number;
      outputTokens?: number;
      costUsd?: number;
      /** Logged by `apply.ts`, so never the request body or an API key. */
      detail?: {
        status?: number;
        type?: string;
        message?: string;
        requestId?: string;
      };
    };

/** The only provider surface `apply.ts` calls. Each adapter computes its own `costUsd`. */
export type LlmClient = {
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResult>;
};

/** Everything the LLM pass needs from outside `src/lib/gap`, built by the caller from the
 * environment and the Postgres store. */
export type LlmConfig = {
  enabled: boolean;
  client: LlmClient;
  model: string;
  effort: LlmEffort;
  /** Returns the cached response for a key, or null on a miss. */
  readCache: (key: string) => Promise<CachedLlmResponse | null>;
  /** Persists a fresh response under its key. */
  writeCache: (key: string, entry: CachedLlmResponse) => Promise<void>;
  /** False once today's spend cap is reached; the pass is skipped. */
  underDailySpendCap: () => Promise<boolean>;
  /** Records the cost of a call actually made, never of a cache hit. */
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
 * names. */
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
