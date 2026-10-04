import type {
  LlmClient,
  LlmCompletionRequest,
  LlmCompletionResult,
} from "./types";

/** OpenAI-style `chat/completions` adapter, not a `baseURL` swap. Local development only. */
export function createOpenRouterClient(
  apiKey: string,
  model: string,
  // A parameter only so tests can exercise the abort without waiting 30 seconds.
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
            // A hung connection must not block until the platform kills the request.
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
          error?: { message?: string };
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
            detail: {
              message: (
                body.error?.message ?? "response missing choices or usage"
              ).slice(0, 300),
            },
          };
        const usage = {
          inputTokens: body.usage.prompt_tokens,
          outputTokens: body.usage.completion_tokens,
        };
        const costUsd = body.usage.cost ?? 0;
        if (choice.finish_reason === "length") {
          return { ok: false, reason: "truncated", ...usage, costUsd };
        }
        if (!choice.message.content)
          return {
            ok: false,
            reason: "error",
            ...usage,
            costUsd,
            detail: {
              message: (
                body.error?.message ?? "empty completion content"
              ).slice(0, 300),
            },
          };

        return {
          ok: true,
          text: choice.message.content,
          ...usage,
          costUsd,
        };
      } catch (error) {
        // Cost is unknown here and recorded as 0.
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
