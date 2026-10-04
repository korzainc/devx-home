import { describe, expect, it, vi, afterEach } from "vitest";
import { createOpenRouterClient } from "./openrouter-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

describe("createOpenRouterClient", () => {
  it("sends the request in OpenRouter's chat-completions shape and returns the response's real usage.cost", async () => {
    const fetchMock = fakeFetch({
      choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0.00123 },
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
      costUsd: 0.00123,
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

  it("reports a free model's cost as 0 rather than omitting it", async () => {
    fakeFetch({
      choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 50, cost: 0 },
    });
    const result = await createOpenRouterClient(
      "test-key",
      "some/free-model",
    ).complete({
      system: "s",
      user: "u",
      schema: {},
      effort: "low",
    });
    expect((result as { costUsd: number }).costUsd).toBe(0);
  });

  it("falls back to 0 with a one-time warning when usage.cost is absent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fakeFetch({
      choices: [{ message: { content: "{}" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    });
    const client = createOpenRouterClient("test-key", "some/free-model");
    const first = await client.complete({
      system: "s",
      user: "u",
      schema: {},
      effort: "low",
    });
    const second = await client.complete({
      system: "s",
      user: "u",
      schema: {},
      effort: "low",
    });
    expect((first as { costUsd: number }).costUsd).toBe(0);
    expect((second as { costUsd: number }).costUsd).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("reports truncated with the real token usage and cost when finish_reason is length", async () => {
    fakeFetch({
      choices: [{ message: { content: null }, finish_reason: "length" }],
      usage: { prompt_tokens: 100, completion_tokens: 4000, cost: 0.02 },
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
      costUsd: 0.02,
    });
  });

  it("reports error with usage and cost when content is empty for a reason other than length", async () => {
    fakeFetch({
      choices: [
        { message: { content: null }, finish_reason: "content_filter" },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 0, cost: 0 },
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
      costUsd: 0,
      detail: { message: "empty completion content" },
    });
  });

  it("reports a diagnosable detail when choices is empty or the HTTP response is not ok", async () => {
    fakeFetch({
      choices: [],
      usage: { prompt_tokens: 100, completion_tokens: 0 },
    });
    const emptyChoices = await createOpenRouterClient("test-key", "m").complete(
      {
        system: "s",
        user: "u",
        schema: {},
        effort: "low",
      },
    );
    expect(emptyChoices).toEqual({
      ok: false,
      reason: "error",
      detail: { message: "response missing choices or usage" },
    });

    fakeFetch({ error: { message: "rate limited" } }, false, 429);
    const notOk = await createOpenRouterClient("test-key", "m").complete({
      system: "s",
      user: "u",
      schema: {},
      effort: "low",
    });
    expect(notOk).toMatchObject({
      ok: false,
      reason: "error",
      detail: { status: 429 },
    });
  });

  it("reports cost 0 and a diagnosable detail when fetch itself throws or a hung request aborts - OpenRouter's usage-based billing never incurred a charge either way", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const thrown = await createOpenRouterClient("test-key", "m").complete({
      system: "s",
      user: "u",
      schema: {},
      effort: "low",
    });
    expect(thrown).toEqual({
      ok: false,
      reason: "error",
      costUsd: 0,
      detail: { type: undefined, message: "network" },
    });

    // A real fetch rejects once the signal it was given aborts - this stands in for that, so the
    // test also proves the adapter actually wires a timeout into the request.
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Request timed out.", "TimeoutError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const aborted = await createOpenRouterClient("test-key", "m", 20).complete({
      system: "s",
      user: "u",
      schema: {},
      effort: "low",
    });
    expect(aborted).toEqual({
      ok: false,
      reason: "error",
      costUsd: 0,
      detail: { type: "timeout", message: "Request timed out." },
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
