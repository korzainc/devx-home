import { warnOnce } from "../warn-once";
import type {
  LlmClient,
  LlmCompletionRequest,
  LlmCompletionResult,
} from "./types";

/** OpenRouter always includes a `cost` in `usage`; a free model reports `0` there, which is the
 * real cost. Falls back to `0` with a one-time warning if a future response ever omits it, rather
 * than recording nothing. */
function costOf(usage: { cost?: number }): number {
  if (usage.cost !== undefined) return usage.cost;
  warnOnce(
    "openrouter-usage-cost-missing",
    "gap LLM pass: OpenRouter response had no usage.cost, recording $0",
  );
  return 0;
}

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

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          return {
            ok: false,
            reason: "error",
            detail: { status: response.status, message: body.slice(0, 300) },
          };
        }

        const body = (await response.json()) as {
          choices?: {
            message: { content: string | null };
            finish_reason: string;
          }[];
          usage?: {
            prompt_tokens: number;
            completion_tokens: number;
            cost?: number;
          };
        };
        const choice = body.choices?.[0];
        if (!choice || !body.usage)
          return {
            ok: false,
            reason: "error",
            detail: { message: "response missing choices or usage" },
          };
        const usage = {
          inputTokens: body.usage.prompt_tokens,
          outputTokens: body.usage.completion_tokens,
        };
        const costUsd = costOf(body.usage);
        if (choice.finish_reason === "length") {
          return { ok: false, reason: "truncated", ...usage, costUsd };
        }
        if (!choice.message.content)
          return {
            ok: false,
            reason: "error",
            ...usage,
            costUsd,
            detail: { message: "empty completion content" },
          };

        return {
          ok: true,
          text: choice.message.content,
          ...usage,
          costUsd,
        };
      } catch (error) {
        // Either the request never reached OpenRouter (network error, our own abort) or the body
        // never parsed - either way, OpenRouter's usage-based billing never incurred a charge for
        // it, so `0` here is the real cost, not just a conservative floor the way Anthropic's
        // timeout estimate is.
        const timedOut =
          error instanceof Error && error.name === "TimeoutError";
        const message = error instanceof Error ? error.message : String(error);
        return {
          ok: false,
          reason: "error",
          costUsd: 0,
          detail: {
            type: timedOut ? "timeout" : undefined,
            message: message.slice(0, 300),
          },
        };
      }
    },
  };
}
