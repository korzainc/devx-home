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

/** `GAP_LLM_DAILY_USD_CAP`, or the default when it isn't a finite number (a NaN cap would block
 * every call). Warns once on a bad value. */
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

/** Soft cap: concurrent requests can all pass this check before any records its cost. The real
 * ceiling is the monthly spend limit on the provider key. */
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
