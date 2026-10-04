import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envKeys = [
  "GAP_LLM_EFFORT",
  "GAP_LLM_ENABLED",
  "GAP_LLM_PROVIDER",
  "ANTHROPIC_API_KEY",
  "OPENROUTER_API_KEY",
  "GAP_LLM_OPENROUTER_MODEL",
] as const;

beforeEach(() => {
  for (const key of envKeys) vi.stubEnv(key, undefined);
});
afterEach(() => vi.unstubAllEnvs());

/** Re-imported per test: `getLlmConfig()` memoizes the built provider in a module-level
 * singleton, so a stale import would keep serving the first test's provider to every case
 * after it, same as `session.test.ts`'s pattern. */
async function loadConfig() {
  vi.resetModules();
  return import("./gap-llm-config");
}

describe("effortFromEnv (via getLlmConfig)", () => {
  it("defaults to low when unset", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "key");
    const { getLlmConfig } = await loadConfig();

    expect(getLlmConfig()?.effort).toBe("low");
  });

  it("uses the env value when it is valid", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "key");
    vi.stubEnv("GAP_LLM_EFFORT", "high");
    const { getLlmConfig } = await loadConfig();

    expect(getLlmConfig()?.effort).toBe("high");
  });

  it("falls back to low and warns once on an invalid value", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "key");
    vi.stubEnv("GAP_LLM_EFFORT", "bogus");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getLlmConfig } = await loadConfig();

    expect(getLlmConfig()?.effort).toBe("low");
    expect(getLlmConfig()?.effort).toBe("low");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("bogus");
    warn.mockRestore();
  });
});

describe("getLlmConfig provider selection", () => {
  it("returns undefined with no Anthropic key and no openrouter provider", async () => {
    const { getLlmConfig } = await loadConfig();

    expect(getLlmConfig()).toBeUndefined();
  });

  it("returns undefined when openrouter is selected but the API key is missing", async () => {
    vi.stubEnv("GAP_LLM_PROVIDER", "openrouter");
    vi.stubEnv("GAP_LLM_OPENROUTER_MODEL", "some/model");
    const { getLlmConfig } = await loadConfig();

    expect(getLlmConfig()).toBeUndefined();
  });

  it("returns undefined when openrouter is selected but the model is missing", async () => {
    vi.stubEnv("GAP_LLM_PROVIDER", "openrouter");
    vi.stubEnv("OPENROUTER_API_KEY", "key");
    const { getLlmConfig } = await loadConfig();

    expect(getLlmConfig()).toBeUndefined();
  });

  it("returns a real config for Anthropic when the API key is present", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "key");
    const { getLlmConfig } = await loadConfig();

    expect(getLlmConfig()?.model).toBe("claude-sonnet-5-5");
  });

  it("returns a real config for OpenRouter when both required vars are present", async () => {
    vi.stubEnv("GAP_LLM_PROVIDER", "openrouter");
    vi.stubEnv("OPENROUTER_API_KEY", "key");
    vi.stubEnv("GAP_LLM_OPENROUTER_MODEL", "some/free-model");
    const { getLlmConfig } = await loadConfig();

    expect(getLlmConfig()?.model).toBe("some/free-model");
  });

  it("reads GAP_LLM_ENABLED as the literal string 'true'", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "key");
    vi.stubEnv("GAP_LLM_ENABLED", "yes");
    const { getLlmConfig } = await loadConfig();

    expect(getLlmConfig()?.enabled).toBe(false);
  });

  it("enables the pass when GAP_LLM_ENABLED is the literal string 'true'", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "key");
    vi.stubEnv("GAP_LLM_ENABLED", "true");
    const { getLlmConfig } = await loadConfig();

    expect(getLlmConfig()?.enabled).toBe(true);
  });
});
