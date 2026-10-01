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
  "claude-sonnet-5": { inputUsdPerMillion: 2, outputUsdPerMillion: 10 },
};

/** Falls back to Sonnet 5 pricing for a `model` this table doesn't recognize, so spend against an
 * unpriced model is still recorded (approximately) rather than crashing - but only after a
 * one-time warning per distinct unrecognized model id. */
function pricingFor(model: string): ModelPricing {
  const pricing = modelPricing[model];
  if (pricing) return pricing;
  warnOnce(
    `unknown-model:${model}`,
    `gap LLM pass: unrecognized model "${model}", falling back to claude-sonnet-5 pricing - spend may be recorded inaccurately`,
  );
  return modelPricing["claude-sonnet-5"];
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

// The unified verdicts+detect response is far smaller than the old three-array shape, so this no
// longer needs the extra headroom adaptive thinking used to require.
const maxTokens = 8000;

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
        // A connection timeout is the one failure mode where real inference may already be
        // running server-side with nothing to show for it - everywhere else here, the call never
        // reached (or never received anything from) the model, so there is genuinely no cost to
        // estimate. The estimate is deliberately pessimistic (worst-case input size at 4
        // chars/token, full `maxTokens` output) so a model/effort combination that reliably times
        // out can never look free to the daily spend cap.
        if (error instanceof Anthropic.APIConnectionTimeoutError) {
          const estimatedInputTokens = Math.ceil(
            (request.system.length + request.user.length) / 4,
          );
          return {
            ok: false,
            reason: "error",
            costUsd: costOf(model, estimatedInputTokens, maxTokens),
          };
        }
        return { ok: false, reason: "error" };
      }
    },
  };
}
