import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { createAnthropicClient } from "./anthropic-client";

const request = { system: "s", user: "u", schema: {}, effort: "low" } as const;

function clientFor(outcome: { resolves: unknown } | { rejects: unknown }) {
  const create =
    "resolves" in outcome
      ? vi.fn().mockResolvedValue(outcome.resolves)
      : vi.fn().mockRejectedValue(outcome.rejects);
  const client = createAnthropicClient(
    { messages: { create } } as never,
    "claude-sonnet-5-5",
  );
  return {
    create,
    complete: (overrides = {}) => client.complete({ ...request, ...overrides }),
  };
}

const sonnetCost = (inputTokens: number, outputTokens: number) =>
  (inputTokens / 1_000_000) * 2 + (outputTokens / 1_000_000) * 10;

describe("createAnthropicClient", () => {
  it("sends the request in the Anthropic shape and reports the real cost on success", async () => {
    const { create, complete } = clientFor({
      resolves: {
        content: [{ type: "text", text: '{"ok":true}' }],
        usage: { input_tokens: 100, output_tokens: 50 },
        stop_reason: "end_turn",
      },
    });

    expect(
      await complete({
        system: "system prompt",
        user: "user prompt",
        schema: { type: "object" },
      }),
    ).toEqual({
      ok: true,
      text: '{"ok":true}',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: sonnetCost(100, 50),
    });
    expect(create).toHaveBeenCalledWith(
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

  it.each([
    {
      name: "truncated",
      message: { content: [], stop_reason: "max_tokens", output: 3000 },
      expected: { reason: "truncated" },
    },
    {
      name: "refusal",
      message: { content: [], stop_reason: "refusal", output: 5 },
      expected: { reason: "refusal" },
    },
    {
      name: "no text block",
      message: {
        content: [{ type: "tool_use", id: "x", name: "y", input: {} }],
        stop_reason: "end_turn",
        output: 50,
      },
      expected: {
        reason: "error",
        detail: { message: "no text block in the response" },
      },
    },
  ])(
    "reports $name with the real usage and cost",
    async ({ message, expected }) => {
      const { complete } = clientFor({
        resolves: {
          content: message.content,
          stop_reason: message.stop_reason,
          usage: { input_tokens: 100, output_tokens: message.output },
        },
      });
      expect(await complete()).toEqual({
        ok: false,
        inputTokens: 100,
        outputTokens: message.output,
        costUsd: sonnetCost(100, message.output),
        ...expected,
      });
    },
  );

  it("reports a diagnosable detail with no cost when the call throws", async () => {
    expect(
      await clientFor({ rejects: new Error("network") }).complete(),
    ).toEqual({
      ok: false,
      reason: "error",
      detail: { message: "network" },
    });

    const long = "m".repeat(1000);
    const api = Anthropic.APIError.generate(
      429,
      { error: { type: "rate_limit_error", message: long } },
      long,
      new Headers({ "request-id": "req_123" }),
    );
    expect(await clientFor({ rejects: api }).complete()).toEqual({
      ok: false,
      reason: "error",
      detail: {
        status: 429,
        type: "rate_limit_error",
        message: "m".repeat(300),
        requestId: "req_123",
      },
    });
  });

  it("charges a timeout an estimate from the input size and the full max_tokens", async () => {
    const system = "x".repeat(4000);
    const user = "y".repeat(4000);
    const result = await clientFor({
      rejects: new Anthropic.APIConnectionTimeoutError(),
    }).complete({ system, user });
    expect(result).toMatchObject({
      ok: false,
      reason: "error",
      detail: { type: "timeout" },
    });
    expect((result as { costUsd: number }).costUsd).toBeCloseTo(
      sonnetCost(Math.ceil((system.length + user.length) / 2), 3000),
      6,
    );
  });
});
