import Anthropic from "@anthropic-ai/sdk";
import type {
  LlmClient,
  LlmCompletionRequest,
  LlmCompletionResult,
} from "./types";

// Sonnet pricing in USD per million tokens. Re-check against Anthropic's published rates.
const inputUsdPerMillion = 2;
const outputUsdPerMillion = 10;

function costOf(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * inputUsdPerMillion +
    (outputTokens / 1_000_000) * outputUsdPerMillion
  );
}

// Output cap, thinking included. The 30s client timeout is the real latency limit.
const maxTokens = 3000;

// Conservative input estimate for a timed-out call; real runs measure about 1.9.
const charsPerToken = 2;

type FailureDetail = Extract<LlmCompletionResult, { ok: false }>["detail"];

function errorDetail(error: unknown): FailureDetail {
  if (error instanceof Anthropic.APIError) {
    // The SDK's `message` is the status plus the raw JSON body; the body's error is the readable
    // part.
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

/** Wraps a constructed `Anthropic` SDK client; its key, retries and timeout are the caller's. */
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

        const usage = {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          costUsd: costOf(
            message.usage.input_tokens,
            message.usage.output_tokens,
          ),
        };

        if (
          message.stop_reason === "max_tokens" ||
          message.stop_reason === "refusal"
        )
          return {
            ok: false,
            reason: message.stop_reason === "refusal" ? "refusal" : "truncated",
            ...usage,
          };

        const text = message.content.find(
          (block) => block.type === "text",
        )?.text;
        if (!text)
          return {
            ok: false,
            reason: "error",
            ...usage,
            detail: { message: "no text block in the response" },
          };

        return { ok: true, text, ...usage };
      } catch (error) {
        // A timeout may leave inference running server-side, so it is charged an estimate: full
        // `maxTokens` output plus input at `charsPerToken`.
        if (error instanceof Anthropic.APIConnectionTimeoutError) {
          const estimatedInputTokens = Math.ceil(
            (request.system.length + request.user.length) / charsPerToken,
          );
          return {
            ok: false,
            reason: "error",
            costUsd: costOf(estimatedInputTokens, maxTokens),
            detail: { type: "timeout", message: "connection timed out" },
          };
        }
        return { ok: false, reason: "error", detail: errorDetail(error) };
      }
    },
  };
}
