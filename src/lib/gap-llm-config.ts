import Anthropic from "@anthropic-ai/sdk";
import { createAnthropicClient } from "./gap/llm/anthropic-client";
import { createOpenRouterClient } from "./gap/llm/openrouter-client";
import {
  readCache,
  writeCache,
  underDailySpendCap,
  recordSpend,
} from "./gap-llm-store";
import type { LlmClient, LlmConfig, LlmEffort } from "./gap/llm/types";

const validEfforts: readonly LlmEffort[] = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

let warnedEffort = false;
let warnedOpenRouter = false;

// Runs on every request, so an invalid value warns once.
function effortFromEnv(): LlmEffort {
  const raw = process.env.GAP_LLM_EFFORT;
  if (raw && (validEfforts as readonly string[]).includes(raw))
    return raw as LlmEffort;
  if (raw && !warnedEffort) {
    warnedEffort = true;
    console.warn(
      `GAP_LLM_EFFORT="${raw}" is not one of ${validEfforts.join(", ")}, using "low"`,
    );
  }
  return "low";
}

function buildProvider(): { client: LlmClient; model: string } | undefined {
  if (process.env.GAP_LLM_PROVIDER === "openrouter") {
    // Local testing only: private CI text must not go to OpenRouter in production.
    if (process.env.NODE_ENV === "production") {
      if (!warnedOpenRouter) {
        warnedOpenRouter = true;
        console.warn(
          "GAP_LLM_PROVIDER=openrouter is refused in production, the LLM pass stays off",
        );
      }
      return undefined;
    }
    const apiKey = process.env.OPENROUTER_API_KEY;
    const model = process.env.GAP_LLM_OPENROUTER_MODEL;
    // No default model: OpenRouter's free models change, so the slug is the operator's pick.
    if (!apiKey || !model) return undefined;
    return { client: createOpenRouterClient(apiKey, model), model };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return undefined;
  const model = "claude-sonnet-5-5";
  const sdk = new Anthropic({ apiKey, maxRetries: 0, timeout: 30_000 });
  return { client: createAnthropicClient(sdk, model), model };
}

// One provider per server instance, like `getPool()`. A missing key is not cached, so a key added
// in local development needs no restart.
let provider: { client: LlmClient; model: string } | undefined;

/** Config for the LLM pass, or undefined when no provider is configured. */
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
