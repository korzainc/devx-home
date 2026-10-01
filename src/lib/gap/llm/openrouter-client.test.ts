import { describe, expect, it, vi, afterEach } from "vitest";
import { createOpenRouterClient } from "./openrouter-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeFetch(body: unknown, ok = true) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("createOpenRouterClient", () => {
  it("sends the request in OpenRouter's chat-completions shape and returns the text", async () => {
    const fetchMock = fakeFetch({
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });
    const client = createOpenRouterClient("test-key", "some/free-model");

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
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: "some/free-model",
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
  });

  it("reports truncated with the real token usage when finish_reason is length", async () => {
    fakeFetch({
      choices: [{ message: { content: null }, finish_reason: "length" }],
      usage: { prompt_tokens: 100, completion_tokens: 4000 },
    });
    const client = createOpenRouterClient("test-key", "some/free-model");

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
      outputTokens: 4000,
    });
  });

  it("reports error with the real token usage when finish_reason is not length but content is empty", async () => {
    fakeFetch({
      choices: [
        { message: { content: null }, finish_reason: "content_filter" },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 0 },
    });
    const client = createOpenRouterClient("test-key", "some/free-model");

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
      outputTokens: 0,
    });
  });

  it("reports error when choices is empty", async () => {
    fakeFetch({
      choices: [],
      usage: { prompt_tokens: 100, completion_tokens: 0 },
    });
    const client = createOpenRouterClient("test-key", "some/free-model");

    const result = await client.complete({
      system: "s",
      user: "u",
      schema: {},
      effort: "low",
    });

    expect(result).toEqual({ ok: false, reason: "error" });
  });

  it("reports error on a non-ok HTTP response", async () => {
    fakeFetch({ error: { message: "rate limited" } }, false);
    const client = createOpenRouterClient("test-key", "some/free-model");

    const result = await client.complete({
      system: "s",
      user: "u",
      schema: {},
      effort: "low",
    });

    expect(result).toEqual({ ok: false, reason: "error" });
  });

  it("reports error when fetch itself throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const client = createOpenRouterClient("test-key", "some/free-model");

    const result = await client.complete({
      system: "s",
      user: "u",
      schema: {},
      effort: "low",
    });

    expect(result).toEqual({ ok: false, reason: "error" });
  });

  it("aborts a hung request instead of blocking indefinitely", async () => {
    // A real fetch rejects once the signal it was given aborts - this stands in for that, so the
    // test proves the adapter actually wires a timeout into the request rather than merely
    // constructing an AbortSignal nobody passes anywhere.
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted.", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    // A short override instead of the real 30s default, so this test doesn't have to wait 30
    // seconds to observe the same abort behavior.
    const client = createOpenRouterClient("test-key", "some/free-model", 20);

    const result = await client.complete({
      system: "s",
      user: "u",
      schema: {},
      effort: "low",
    });

    expect(result).toEqual({ ok: false, reason: "error" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
