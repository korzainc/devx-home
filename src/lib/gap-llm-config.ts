import Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClient } from "./gap/llm/anthropic-client";
import { createOpenRouterClient } from "./gap/llm/openrouter-client";
import { warnOnce } from "./gap/warn-once";
import {
  readCache,
  writeCache,
  underDailySpendCap,
  recordSpend,
} from "./gap-llm-store";
import type { LlmClient, LlmConfig, LlmEffort } from "./gap/llm/types";

// LlmEffort is the one place this union is declared - reused here rather than redeclared.
const validEfforts: readonly LlmEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

// `getLlmConfig()` runs on every `/api/analyze` call, so an invalid value would otherwise warn on
// every request forever - matching the one-time-warning pattern `gap-llm-store.ts` and
// `gap/llm/apply.ts` already use for their own invalid-env-value and unknown-model cases.
function effortFromEnv(): LlmEffort {
  const raw = process.env.GAP_LLM_EFFORT;
  if (raw && (validEfforts as readonly string[]).includes(raw))
    return raw as LlmEffort;
  if (raw) {
    warnOnce(
      "GAP_LLM_EFFORT",
      `GAP_LLM_EFFORT="${raw}" is not one of ${validEfforts.join(", ")}, using "low"`,
    );
  }
  return "low";
}

function buildProvider(): { client: LlmClient; model: string } | undefined {
  if (process.env.GAP_LLM_PROVIDER === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.GAP_LLM_OPENROUTER_MODEL;
    // Both required, no hardcoded fallback model: which OpenRouter models are free or worth using
    // changes over time, so whoever sets this up for local testing picks a real, current slug from
    // openrouter.ai/models themselves rather than trusting a slug baked into this file.
    if (!apiKey || !model) return undefined;
    return { client: createOpenRouterClient(apiKey, model), model };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return undefined;
  const model = "claude-sonnet-5";
  const sdk = new Anthropic({ apiKey, maxRetries: 0, timeout: 30_000 });
  return { client: createAnthropicClient(sdk, model), model };
}

// Built once per server instance, not per request: the underlying SDK/fetch client holds its own
// connection handling, and `db.ts`'s `getPool()` uses this same lazy-singleton shape for the same
// reason. `undefined` (missing credentials) is retried on every call rather than cached, since it
// costs nothing and lets credentials appear without a restart in local development.
let provider: { client: LlmClient; model: string } | undefined;

/**
 * Builds the LLM pass's config from the environment, or undefined if it can't run at all.
 * `runAnalysis` treats a missing `llm` the same as `enabled: false`, so callers pass this through.
 */
export function getLlmConfig(): LlmConfig | undefined {
  provider ??= buildProvider();
  if (!provider) return undefined;

  return {
    enabled: process.env.GAP_LLM_ENABLED === "true",
    client: provider.client,
    model: provider.model,
    effort: effortFromEnv(),
    readCache,
    writeCache,
    underDailySpendCap,
    recordSpend,
  };
}
