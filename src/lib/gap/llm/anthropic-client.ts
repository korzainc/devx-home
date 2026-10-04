import Anthropic from "@anthropic-ai/sdk";
import { warnOnce } from "../warn-once";
import type {
  LlmClient,
  LlmCompletionRequest,
  LlmCompletionResult,
} from "./types";

type ModelPricing = { inputUsdPerMillion: number; outputUsdPerMillion: number };

// Per-million-token pricing, keyed by model id. Re-check against Anthropic's published rates
// before shipping: pricing changes independently of this codebase.
const modelPricing: Record<string, ModelPricing> = {
  "claude-sonnet-5-5": { inputUsdPerMillion: 2, outputUsdPerMillion: 10 },
};

const fallbackModel = "claude-sonnet-5-5";

/** Falls back to Sonnet pricing for a `model` this table doesn't recognize, so spend against an
 * unpriced model is still recorded (approximately) rather than crashing - but only after a
 * one-time warning per distinct unrecognized model id. */
function pricingFor(model: string): ModelPricing {
  const pricing = modelPricing[model];
  if (pricing) return pricing;
  warnOnce(
    `unknown-model:${model}`,
    `gap LLM pass: unrecognized model "${model}", falling back to ${fallbackModel} pricing - spend may be recorded inaccurately`,
  );
  return modelPricing[fallbackModel];
}

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

// Output cap, thinking included. The 30s client timeout is the real latency limit.
const maxTokens = 3000;

// Conservative input estimate for a timed-out call; real runs measure about 1.9.
const charsPerToken = 2;

type FailureDetail = Extract<LlmCompletionResult, { ok: false }>["detail"];

function errorDetail(error: unknown): FailureDetail {
  if (error instanceof Anthropic.APIError) {
    // The SDK's own `message` is the status plus the raw JSON body; the body's error object is
    // the readable part.
    const body = error.error as
      { error?: { type?: string; message?: string } } | undefined;
    return {
      status: error.status,
      type: body?.error?.type ?? error.type ?? undefined,
      message: (body?.error?.message ?? error.message)?.slice(0, 300),
      requestId: error.requestID ?? undefined,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { message: message.slice(0, 300) };
}

/** Wraps a real, already-constructed `Anthropic` SDK client. The client itself (API key, retry
 * count, timeout) is the caller's concern; this function only shapes one request. */
export function createAnthropicClient(
  client: Anthropic,
  model: string,
): LlmClient {
  return {
    async complete(
      request: LlmCompletionRequest,
    ): Promise<LlmCompletionResult> {
      try {
        const message = await client.messages.create({
          model,
          max_tokens: maxTokens,
          thinking: { type: "adaptive" },
          output_config: {
            effort: request.effort,
            format: {
              type: "json_schema",
              schema: request.schema,
            },
          },
          system: request.system,
          messages: [{ role: "user", content: request.user }],
        });

        if (
          message.stop_reason === "max_tokens" ||
          message.stop_reason === "refusal"
        )
          return {
            ok: false,
            reason: message.stop_reason === "refusal" ? "refusal" : "truncated",
            inputTokens: message.usage.input_tokens,
            outputTokens: message.usage.output_tokens,
            costUsd: costOf(
              model,
              message.usage.input_tokens,
              message.usage.output_tokens,
            ),
          };

        const text = message.content.find(
          (block) => block.type === "text",
        )?.text;
        if (!text)
          return {
            ok: false,
            reason: "error",
            inputTokens: message.usage.input_tokens,
            outputTokens: message.usage.output_tokens,
            costUsd: costOf(
              model,
              message.usage.input_tokens,
              message.usage.output_tokens,
            ),
            detail: { message: "no text block in the response" },
          };

        return {
          ok: true,
          text,
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          costUsd: costOf(
            model,
            message.usage.input_tokens,
            message.usage.output_tokens,
          ),
        };
      } catch (error) {
        // A timeout may leave inference running server-side, so it is charged an estimate
        // instead of nothing: full `maxTokens` output plus input at `charsPerToken`.
        if (error instanceof Anthropic.APIConnectionTimeoutError) {
          const estimatedInputTokens = Math.ceil(
            (request.system.length + request.user.length) / charsPerToken,
          );
          return {
            ok: false,
            reason: "error",
            costUsd: costOf(model, estimatedInputTokens, maxTokens),
            detail: { type: "timeout", message: "connection timed out" },
          };
        }
        return { ok: false, reason: "error", detail: errorDetail(error) };
      }
    },
  };
}
