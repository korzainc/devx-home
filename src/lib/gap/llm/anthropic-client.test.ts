import { describe, expect, it, vi } from "vitest";
import { createAnthropicClient } from "./anthropic-client";

function fakeAnthropicSdk(message: unknown) {
  return { messages: { create: vi.fn().mockResolvedValue(message) } };
}

describe("createAnthropicClient", () => {
  it("sends the request in the real Anthropic shape and returns the text on success", async () => {
    const sdk = fakeAnthropicSdk({
      content: [{ type: "text", text: '{"ok":true}' }],
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: "end_turn",
    });
    const client = createAnthropicClient(sdk as never, "claude-sonnet-5");

    const result = await client.complete({
      system: "system prompt",
      user: "user prompt",
      schema: { type: "object" },
      effort: "low",
    });

    expect(result).toEqual({
      ok: true,
      text: '{"ok":true}',
      inputTokens: 100,
      outputTokens: 50,
    });
    expect(sdk.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-5",
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: { type: "object" } },
        },
        system: "system prompt",
        messages: [{ role: "user", content: "user prompt" }],
      }),
    );
  });

  it("reports truncated with the real token usage when stop_reason is max_tokens", async () => {
    // Anthropic bills for a truncated response's tokens exactly as it would a successful one, so
    // the caller (apply.ts) needs these counts to record the real cost of a call it must discard.
    const sdk = fakeAnthropicSdk({
      content: [{ type: "text", text: "{not valid" }],
      usage: { input_tokens: 100, output_tokens: 8000 },
      stop_reason: "max_tokens",
    });
    const client = createAnthropicClient(sdk as never, "claude-sonnet-5");

    const result = await client.complete({
      system: "s",
      user: "u",
      schema: {},
      effort: "low",
    });

    expect(result).toEqual({
      ok: false,
      reason: "truncated",
      inputTokens: 100,
      outputTokens: 8000,
    });
  });

  it("reports error with the real token usage when the response has no text block", async () => {
    // A real HTTP response with usage data was received here; only a call that threw before any
    // response existed omits it.
    const sdk = fakeAnthropicSdk({
      content: [{ type: "tool_use", id: "x", name: "y", input: {} }],
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: "end_turn",
    });
    const client = createAnthropicClient(sdk as never, "claude-sonnet-5");

    const result = await client.complete({
      system: "s",
      user: "u",
      schema: {},
      effort: "low",
    });

    expect(result).toEqual({
      ok: false,
      reason: "error",
      inputTokens: 100,
      outputTokens: 50,
    });
  });

  it("reports error with no usage data when the call throws", async () => {
    const sdk = {
      messages: { create: vi.fn().mockRejectedValue(new Error("network")) },
    };
    const client = createAnthropicClient(sdk as never, "claude-sonnet-5");

    const result = await client.complete({
      system: "s",
      user: "u",
      schema: {},
      effort: "low",
    });

    expect(result).toEqual({ ok: false, reason: "error" });
  });
});
