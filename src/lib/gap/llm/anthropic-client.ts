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

// Keeps a runaway response from ever threatening the route's 30s budget: at normal output speeds
// this is a few seconds of generation, well inside the timeout, with room to spare for input
// processing and network time.
const maxTokens = 3000;

type FailureDetail = Extract<LlmCompletionResult, { ok: false }>["detail"];

function errorDetail(error: unknown): FailureDetail {
  if (error instanceof Anthropic.APIError) {
    return {
      status: error.status,
      type: error.type ?? undefined,
      message: error.message?.slice(0, 300),
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

        if (message.stop_reason === "max_tokens")
          return {
            ok: false,
            reason: "truncated",
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
        // A connection timeout is the one failure mode where inference may already be running
        // server-side with nothing to show for it, so it gets a real cost estimate rather than
        // none. The estimate uses worst-case input size (4 chars/token) and the full `maxTokens`
        // output, so a model/effort combination that reliably times out never looks free.
        if (error instanceof Anthropic.APIConnectionTimeoutError) {
          const estimatedInputTokens = Math.ceil(
            (request.system.length + request.user.length) / 4,
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
