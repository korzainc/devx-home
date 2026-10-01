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
  | { ok: true; text: string; inputTokens: number; outputTokens: number }
  | {
      ok: false;
      reason: "truncated" | "error";
      // Anthropic bills for a truncated response's tokens exactly as it would a successful one,
      // so a failure with real usage data still has a real cost to record against the daily spend
      // cap. Omitted only when the call itself never returned usage data (e.g. it threw before any
      // response existed) - there, no real cost is knowable, and none was necessarily incurred.
      inputTokens?: number;
      outputTokens?: number;
    };

/** The only surface `apply.ts` calls. Implemented once for the real Anthropic API and once for
 * OpenRouter, so swapping providers for local testing is a config change, never a code change in
 * the orchestrator. */
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

export type LlmFinding = {
  capabilityId: string;
  quote: string;
};

/** `toolId` must belong to this finding's own capability's `recommended` list (re-verified in
 * `apply.ts`, not just trusted from the schema's enum) - a rescue finding can only confirm a
 * specific catalogue tool the analysis already considered relevant, never name a new one. */
export type RescueFinding = LlmFinding & { toolId: string };
/** `toolId` decides which present tool a finding demotes, never the quote. `evidenceFor` in
 * `detect.ts` only ever produces synthesized strings (`"uses: x/y"`, `"runs z in f"`), never raw
 * CI text, so a raw quote can never match `PresentTool.evidence`.
 *
 * The quote still must `verifyQuote` against the real raw signals, proving the model isn't
 * inventing evidence; `toolId` is what says which tool it's about. */
export type AuditFinding = LlmFinding & { toolId: string; reason: string };
export type DetectFinding = {
  kind: BuildStepKind;
  quote: string;
};

export type LlmResponse = {
  rescueFindings: RescueFinding[];
  auditFindings: AuditFinding[];
  detectFindings: DetectFinding[];
};
