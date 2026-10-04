import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenRouterClient } from "./openrouter-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const request = { system: "s", user: "u", schema: {}, effort: "low" } as const;

function fakeFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const complete = (overrides = {}) =>
  createOpenRouterClient("test-key", "some/model").complete({
    ...request,
    ...overrides,
  });

const choice = (content: string | null, finish_reason = "stop") => ({
  choices: [{ message: { content }, finish_reason }],
});

describe("createOpenRouterClient", () => {
  it("sends the chat-completions shape and returns the response's usage.cost, 0 for a free model", async () => {
    const fetchMock = fakeFetch({
      ...choice('{"ok":true}'),
      usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.00123 },
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
      costUsd: 0.00123,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "some/model",
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "user prompt" },
      ],
      reasoning: { effort: "low" },
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "gap_llm_response",
          strict: true,
          schema: { type: "object" },
        },
      },
    });
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-key" });

    for (const cost of [0, undefined]) {
      fakeFetch({
        ...choice("{}"),
        usage: { prompt_tokens: 1, completion_tokens: 1, cost },
      });
      expect(await complete()).toMatchObject({ ok: true, costUsd: 0 });
    }
  });

  it.each([
    {
      name: "finish_reason length",
      body: {
        ...choice(null, "length"),
        usage: { prompt_tokens: 100, completion_tokens: 4000, cost: 0.02 },
      },
      expected: {
        reason: "truncated",
        inputTokens: 100,
        outputTokens: 4000,
        costUsd: 0.02,
      },
    },
    {
      name: "empty content",
      body: {
        ...choice(null, "content_filter"),
        usage: { prompt_tokens: 100, completion_tokens: 0, cost: 0 },
      },
      expected: {
        reason: "error",
        inputTokens: 100,
        outputTokens: 0,
        costUsd: 0,
        detail: { message: "empty completion content" },
      },
    },
    {
      name: "empty choices",
      body: {
        choices: [],
        usage: { prompt_tokens: 100, completion_tokens: 0 },
      },
      expected: {
        reason: "error",
        detail: { message: "response missing choices or usage" },
      },
    },
    {
      name: "a 200 response carrying an error",
      body: { error: { message: "upstream model unavailable" } },
      expected: {
        reason: "error",
        detail: { message: "upstream model unavailable" },
      },
    },
  ])("reports $name", async ({ body, expected }) => {
    fakeFetch(body);
    expect(await complete()).toEqual({ ok: false, ...expected });
  });

  it("reports status and a message trimmed to 300 characters for a non-ok response", async () => {
    fakeFetch({ error: { message: "x".repeat(1000) } }, false, 500);
    const result = await complete();
    expect(result).toMatchObject({ ok: false, detail: { status: 500 } });
    expect(
      (result as { detail: { message: string } }).detail.message,
    ).toHaveLength(300);
  });

  it("reports cost 0 when fetch throws or a hung request aborts", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await complete()).toEqual({
      ok: false,
      reason: "error",
      costUsd: 0,
      detail: { type: undefined, message: "network" },
    });

    // A real fetch rejects once its signal aborts, so this also proves the timeout is wired in.
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Request timed out.", "TimeoutError")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await createOpenRouterClient("test-key", "m", 20).complete(request),
    ).toEqual({
      ok: false,
      reason: "error",
      costUsd: 0,
      detail: { type: "timeout", message: "Request timed out." },
    });
  });
});
