import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Only `dailyUsdCap()` is a pure function of the environment. The other exports touch `getPool()`
// and stay untested here, per this codebase's convention for `db.ts`-touching modules.

beforeEach(() => {
  vi.stubEnv("GAP_LLM_DAILY_USD_CAP", undefined);
});
afterEach(() => vi.unstubAllEnvs());

/** Re-imported per test so the once-only warning state never leaks between tests. */
async function loadStore() {
  vi.resetModules();
  return import("./gap-llm-store");
}

describe("dailyUsdCap", () => {
  it.each([
    [undefined, 5],
    ["12.5", 12.5],
    ["", 5],
  ])("%j gives %s", async (raw, expected) => {
    vi.stubEnv("GAP_LLM_DAILY_USD_CAP", raw);
    const { dailyUsdCap } = await loadStore();
    expect(dailyUsdCap()).toBe(expected);
  });

  it("falls back to the default and warns once on an invalid value", async () => {
    vi.stubEnv("GAP_LLM_DAILY_USD_CAP", "not-a-number");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { dailyUsdCap } = await loadStore();

    expect(dailyUsdCap()).toBe(5);
    expect(dailyUsdCap()).toBe(5);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("not-a-number");
    warn.mockRestore();
  });
});
