import { getPool } from "./db";
import { warnOnce } from "./gap/warn-once";
import type { CachedLlmResponse } from "./gap/llm/types";

// The Postgres-backed store for the gap-analysis LLM pass: the response cache and the daily spend
// cap. Lives outside src/lib/gap so nothing in that directory touches the database or reads the
// environment directly.

export async function readCache(
  key: string,
): Promise<CachedLlmResponse | null> {
  // The selected columns line up with CachedLlmResponse's fields exactly, so the row can be
  // returned as-is instead of rebuilt field by field.
  const result = await getPool().query<CachedLlmResponse>(
    `select "model", "response", "inputTokens", "outputTokens" from "gap_llm_cache" where "key" = $1`,
    [key],
  );
  return result.rows[0] ?? null;
}

/** `do update` lets a fresh response replace a malformed row, so the shape-validation fallback in
 * `apply.ts` heals the key instead of leaving it broken. The model is not deterministic, so two
 * writes under one key can legitimately differ. */
export async function writeCache(
  key: string,
  entry: CachedLlmResponse,
): Promise<void> {
  await getPool().query(
    `insert into "gap_llm_cache" ("key", "model", "response", "inputTokens", "outputTokens")
     values ($1, $2, $3, $4, $5)
     on conflict ("key") do update set
       "model" = excluded."model",
       "response" = excluded."response",
       "inputTokens" = excluded."inputTokens",
       "outputTokens" = excluded."outputTokens",
       "createdAt" = now()`,
    [
      key,
      entry.model,
      JSON.stringify(entry.response),
      entry.inputTokens,
      entry.outputTokens,
    ],
  );
}

// UTC, not the operator's local day: the budget window rolls over at midnight UTC regardless of
// where the pass runs from.
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const defaultDailyUsdCap = 5;

/** Falls back to the default cap when `GAP_LLM_DAILY_USD_CAP` is set but doesn't parse to a valid
 * finite number - `Number("abc")` is `NaN`, and `spent < NaN` is always `false`, which would
 * otherwise disable the pass silently by making every day look already over budget. Warns once so
 * a broken value doesn't fail with zero signal. */
export function dailyUsdCap(): number {
  const raw = process.env.GAP_LLM_DAILY_USD_CAP;
  // `if (!raw)`, not `??`: an empty string is a real risk since `.env.example`'s blank-value
  // convention for secrets could get copied into `.env.local` for this non-secret var, and
  // `Number("") === 0` would otherwise disable the pass the same way `NaN` does above.
  if (!raw) return defaultDailyUsdCap;
  const parsed = Number(raw);
  if (Number.isFinite(parsed)) return parsed;
  warnOnce(
    "GAP_LLM_DAILY_USD_CAP",
    `gap LLM pass: GAP_LLM_DAILY_USD_CAP="${raw}" is not a valid number, using the default cap of ${defaultDailyUsdCap} instead`,
  );
  return defaultDailyUsdCap;
}

/** Soft and non-atomic: this reads today's spend, and the caller acts on that answer with a
 * separate call to `recordSpend`, so concurrent requests can each pass the check before any of
 * them records its cost. Spend can overshoot the cap by up to concurrent-request-volume times
 * per-call-cost, accepted at this feature's current scale (a handful of org-gated engineers).
 *
 * The real backstop is the provider-side monthly spend cap on the dedicated Anthropic Console key
 * in `.env.example`; this check alone is not a guaranteed ceiling. */
export async function underDailySpendCap(): Promise<boolean> {
  const capUsd = dailyUsdCap();
  const result = await getPool().query<{ usd: string }>(
    `select "usd" from "gap_llm_daily_spend" where "day" = $1`,
    [today()],
  );
  const spent = Number(result.rows[0]?.usd ?? 0);
  return spent < capUsd;
}

export async function recordSpend(usd: number): Promise<void> {
  await getPool().query(
    `insert into "gap_llm_daily_spend" ("day", "usd") values ($1, $2)
     on conflict ("day") do update set "usd" = "gap_llm_daily_spend"."usd" + excluded."usd"`,
    [today(), usd],
  );
}
