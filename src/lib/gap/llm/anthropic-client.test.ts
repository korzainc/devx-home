import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { createAnthropicClient } from "./anthropic-client";

function fakeAnthropicSdk(message: unknown) {
  return { messages: { create: vi.fn().mockResolvedValue(message) } };
}

const sonnetCost = (inputTokens: number, outputTokens: number) =>
  (inputTokens / 1_000_000) * 2 + (outputTokens / 1_000_000) * 10;

describe("createAnthropicClient", () => {
  it("sends the request in the real Anthropic shape and reports the real cost on success", async () => {
    const sdk = fakeAnthropicSdk({
      content: [{ type: "text", text: '{"ok":true}' }],
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: "end_turn",
    });
    const client = createAnthropicClient(sdk as never, "claude-sonnet-5-5");

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
      costUsd: sonnetCost(100, 50),
    });
    expect(sdk.messages.create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-5-5",
        max_tokens: 3000,
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

  it("reports truncated, and error-with-no-text-block, with the real token usage, cost, and a diagnosable detail", async () => {
    // Anthropic bills for these tokens exactly as it would a successful call, so the caller
    // (apply.ts) needs the real cost to record against the daily spend cap for a call it discards.
    const truncated = fakeAnthropicSdk({
      content: [{ type: "text", text: "{not valid" }],
      usage: { input_tokens: 100, output_tokens: 3000 },
      stop_reason: "max_tokens",
    });
    const truncatedResult = await createAnthropicClient(
      truncated as never,
      "claude-sonnet-5-5",
    ).complete({ system: "s", user: "u", schema: {}, effort: "low" });
    expect(truncatedResult).toEqual({
      ok: false,
      reason: "truncated",
      inputTokens: 100,
      outputTokens: 3000,
      costUsd: sonnetCost(100, 3000),
    });

    const noText = fakeAnthropicSdk({
      content: [{ type: "tool_use", id: "x", name: "y", input: {} }],
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: "end_turn",
    });
    const noTextResult = await createAnthropicClient(
      noText as never,
      "claude-sonnet-5-5",
    ).complete({
      system: "s",
      user: "u",
      schema: {},
      effort: "low",
    });
    expect(noTextResult).toEqual({
      ok: false,
      reason: "error",
      inputTokens: 100,
      outputTokens: 50,
      costUsd: sonnetCost(100, 50),
      detail: { message: "no text block in the response" },
    });
  });

  it("reports error detail with no cost when the call throws for a reason other than a connection timeout", async () => {
    const sdk = {
      messages: { create: vi.fn().mockRejectedValue(new Error("network")) },
    };
    const result = await createAnthropicClient(
      sdk as never,
      "claude-sonnet-5-5",
    ).complete({
      system: "s",
      user: "u",
      schema: {},
      effort: "low",
    });
    expect(result).toEqual({
      ok: false,
      reason: "error",
      detail: { message: "network" },
    });
  });

  it("reports status, type, and request id from a real Anthropic API error", async () => {
    const sdk = {
      messages: {
        create: vi
          .fn()
          .mockRejectedValue(
            Anthropic.APIError.generate(
              429,
              { error: { type: "rate_limit_error", message: "slow down" } },
              "slow down",
              new Headers({ "request-id": "req_123" }),
            ),
          ),
      },
    };
    const result = await createAnthropicClient(
      sdk as never,
      "claude-sonnet-5-5",
    ).complete({ system: "s", user: "u", schema: {}, effort: "low" });
    expect(result).toMatchObject({
      ok: false,
      reason: "error",
      detail: {
        status: 429,
        type: "rate_limit_error",
        message: "slow down",
        requestId: "req_123",
      },
    });
  });

  it("reports a refusal as its own reason, billed at real usage", async () => {
    const sdk = fakeAnthropicSdk({
      content: [],
      usage: { input_tokens: 100, output_tokens: 5 },
      stop_reason: "refusal",
    });
    const result = await createAnthropicClient(
      sdk as never,
      "claude-sonnet-5-5",
    ).complete({ system: "s", user: "u", schema: {}, effort: "low" });
    expect(result).toEqual({
      ok: false,
      reason: "refusal",
      inputTokens: 100,
      outputTokens: 5,
      costUsd: sonnetCost(100, 5),
    });
  });

  it("trims a long API error message to 300 characters", async () => {
    const long = "m".repeat(1000);
    const sdk = {
      messages: {
        create: vi
          .fn()
          .mockRejectedValue(
            Anthropic.APIError.generate(
              500,
              { error: { type: "api_error", message: long } },
              long,
              new Headers(),
            ),
          ),
      },
    };
    const result = await createAnthropicClient(
      sdk as never,
      "claude-sonnet-5-5",
    ).complete({ system: "s", user: "u", schema: {}, effort: "low" });
    expect(
      (result as { detail: { message: string } }).detail.message,
    ).toHaveLength(300);
  });

  it("estimates a conservative cost on a connection timeout, says so in the detail, from input size and the full max_tokens, so a timeout is never free against the spend cap", async () => {
    const sdk = {
      messages: {
        create: vi
          .fn()
          .mockRejectedValue(new Anthropic.APIConnectionTimeoutError()),
      },
    };
    const system = "x".repeat(4000);
    const user = "y".repeat(4000);
    const result = await createAnthropicClient(
      sdk as never,
      "claude-sonnet-5-5",
    ).complete({
      system,
      user,
      schema: {},
      effort: "low",
    });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      reason: "error",
      detail: { type: "timeout" },
    });
    const estimatedInputTokens = Math.ceil((system.length + user.length) / 2);
    expect((result as { costUsd?: number }).costUsd).toBeCloseTo(
      sonnetCost(estimatedInputTokens, 3000),
      6,
    );
  });

  it("falls back to Sonnet pricing, with a one-time warning, for an unrecognized model id", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const sdk = fakeAnthropicSdk({
      content: [{ type: "text", text: "{}" }],
      usage: { input_tokens: 100, output_tokens: 50 },
      stop_reason: "end_turn",
    });
    const client = createAnthropicClient(sdk as never, "some-unpriced-model");

    await client.complete({
      system: "s",
      user: "u",
      schema: {},
      effort: "low",
    });
    const result = await client.complete({
      system: "s",
      user: "u",
      schema: {},
      effort: "low",
    });

    expect((result as { costUsd: number }).costUsd).toBe(sonnetCost(100, 50));
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
