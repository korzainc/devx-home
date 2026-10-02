import type Anthropic from "@anthropic-ai/sdk";
import type {
  LlmClient,
  LlmCompletionRequest,
  LlmCompletionResult,
} from "./types";

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
          // Thinking tokens count against max_tokens with adaptive thinking on, so this needs
          // headroom well past the actual JSON response size or higher effort levels truncate.
          max_tokens: 16000,
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
          };

        return {
          ok: true,
          text,
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
        };
      } catch {
        // The call itself threw before any response - including its usage - ever existed, so
        // there is no token count to report and no known cost to bill against the spend cap.
        return { ok: false, reason: "error" };
      }
    },
  };
}
