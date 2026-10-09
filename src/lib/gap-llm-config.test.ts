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
 * singleton, so a stale import would serve the first test's provider to every later case. */
async function loadConfig() {
  vi.resetModules();
  return import("./gap-llm-config");
}

const anthropic = { ANTHROPIC_API_KEY: "key" };
const openrouter = {
  GAP_LLM_PROVIDER: "openrouter",
  OPENROUTER_API_KEY: "key",
  GAP_LLM_OPENROUTER_MODEL: "some/free-model",
};

describe("getLlmConfig", () => {
  it.each([
    { name: "no provider configured", env: {}, expected: undefined },
    {
      name: "openrouter without an API key",
      env: { ...openrouter, OPENROUTER_API_KEY: undefined },
      expected: undefined,
    },
    {
      name: "openrouter without a model",
      env: { ...openrouter, GAP_LLM_OPENROUTER_MODEL: undefined },
      expected: undefined,
    },
    {
      name: "anthropic, disabled by default",
      env: anthropic,
      expected: { model: "claude-sonnet-5-5", effort: "low", enabled: false },
    },
    {
      name: "anthropic, enabled only by the literal 'true'",
      env: { ...anthropic, GAP_LLM_ENABLED: "yes" },
      expected: { model: "claude-sonnet-5-5", effort: "low", enabled: false },
    },
    {
      name: "anthropic with a valid effort, enabled",
      env: { ...anthropic, GAP_LLM_EFFORT: "high", GAP_LLM_ENABLED: "true" },
      expected: { model: "claude-sonnet-5-5", effort: "high", enabled: true },
    },
    {
      name: "openrouter with both required vars",
      env: openrouter,
      expected: { model: "some/free-model", effort: "low", enabled: false },
    },
  ])("$name", async ({ env, expected }) => {
    for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
    const { getLlmConfig } = await loadConfig();
    const config = getLlmConfig();
    expect(
      config && {
        model: config.model,
        effort: config.effort,
        enabled: config.enabled,
      },
    ).toEqual(expected);
  });

  it.each([
    { nodeEnv: "production", expected: undefined },
    { nodeEnv: "development", expected: "some/free-model" },
  ])(
    "openrouter in $nodeEnv gives $expected",
    async ({ nodeEnv, expected }) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      for (const [key, value] of Object.entries(openrouter))
        vi.stubEnv(key, value);
      const { getLlmConfig } = await loadConfig();
      expect(getLlmConfig()?.model).toBe(expected);
    },
  );

  it("warns once when production refuses openrouter, and never in development", async () => {
    for (const [key, value] of Object.entries(openrouter))
      vi.stubEnv(key, value);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.stubEnv("NODE_ENV", "development");
    const dev = await loadConfig();
    dev.getLlmConfig();
    expect(warn).not.toHaveBeenCalled();

    vi.stubEnv("NODE_ENV", "production");
    const prod = await loadConfig();
    expect(prod.getLlmConfig()).toBeUndefined();
    expect(prod.getLlmConfig()).toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("openrouter");
    warn.mockRestore();
  });

  it("falls back to low and warns once on an invalid effort", async () => {
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
