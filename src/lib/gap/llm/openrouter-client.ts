import type {
  LlmClient,
  LlmCompletionRequest,
  LlmCompletionResult,
} from "./types";

/**
 * OpenRouter is not wire-compatible with the Anthropic Messages API: it speaks an OpenAI-style
 * `chat/completions` shape (`response_format`, a `reasoning` block instead of `thinking`), so this
 * is a real adapter, not a `baseURL` swap.
 *
 * Meant for local development against a free or low-cost OpenRouter model without a dedicated
 * Anthropic key; wired in behind an environment variable, never used in production.
 */
export function createOpenRouterClient(
  apiKey: string,
  model: string,
  // Matches the Anthropic adapter's timeout in production; a parameter only so tests can exercise
  // the abort behavior itself without a real 30-second wait.
  timeoutMs = 30_000,
): LlmClient {
  return {
    async complete(
      request: LlmCompletionRequest,
    ): Promise<LlmCompletionResult> {
      try {
        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: "system", content: request.system },
                { role: "user", content: request.user },
              ],
              reasoning: { effort: request.effort },
              response_format: {
                type: "json_schema",
                json_schema: {
                  name: "gap_llm_response",
                  strict: true,
                  schema: request.schema,
                },
              },
            }),
            // Without this, a hung connection would block indefinitely, bounded only by whatever
            // the hosting platform eventually kills it at.
            signal: AbortSignal.timeout(timeoutMs),
          },
        );

        if (!response.ok) return { ok: false, reason: "error" };

        const body = (await response.json()) as {
          choices?: {
            message: { content: string | null };
            finish_reason: string;
          }[];
          usage?: { prompt_tokens: number; completion_tokens: number };
        };
        const choice = body.choices?.[0];
        if (!choice || !body.usage) return { ok: false, reason: "error" };
        const usage = {
          inputTokens: body.usage.prompt_tokens,
          outputTokens: body.usage.completion_tokens,
        };
        if (choice.finish_reason === "length") {
          return { ok: false, reason: "truncated", ...usage };
        }
        if (!choice.message.content)
          return { ok: false, reason: "error", ...usage };

        return {
          ok: true,
          text: choice.message.content,
          ...usage,
        };
      } catch {
        // Either the request never reached OpenRouter (network error, our own 30s abort) or the
        // body never parsed - either way no usage data ever existed, so no cost is knowable.
        return { ok: false, reason: "error" };
      }
    },
  };
}
