import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `dailyUsdCap()` is a pure function of the environment, unlike this file's other exports
// (`readCache`, `writeCache`, `underDailySpendCap`, `recordSpend`), which all touch `getPool()`
// and stay untested here per this codebase's established convention for `db.ts`-touching modules.

beforeEach(() => {
  vi.stubEnv("GAP_LLM_DAILY_USD_CAP", undefined);
});
afterEach(() => vi.unstubAllEnvs());

/** Re-imported per test: `warnOnce` (shared with `gap-llm-config.ts` and `gap/llm/apply.ts`)
 * keeps its "already warned" state in a module-level `Set`, so a stale import would leak a warning
 * from one test into the next. */
async function loadStore() {
  vi.resetModules();
  return import("./gap-llm-store");
}

describe("dailyUsdCap", () => {
  it("defaults to 5 when unset", async () => {
    const { dailyUsdCap } = await loadStore();
    expect(dailyUsdCap()).toBe(5);
  });

  it("uses a valid override", async () => {
    vi.stubEnv("GAP_LLM_DAILY_USD_CAP", "12.5");
    const { dailyUsdCap } = await loadStore();
    expect(dailyUsdCap()).toBe(12.5);
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
