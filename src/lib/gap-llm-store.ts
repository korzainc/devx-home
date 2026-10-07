import { getPool } from "./db";
import type { CachedLlmResponse } from "./gap/llm/types";

// Postgres store for the LLM pass: the response cache and the daily spend cap. Lives outside
// src/lib/gap so nothing there touches the database or the environment.

export async function readCache(
  key: string,
): Promise<CachedLlmResponse | null> {
  const result = await getPool().query<CachedLlmResponse>(
    `select "model", "response", "inputTokens", "outputTokens" from "gap_llm_cache" where "key" = $1`,
    [key],
  );
  return result.rows[0] ?? null;
}

/** `do update` lets a fresh response replace a malformed row. */
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

// UTC: the budget window rolls over at midnight UTC wherever the pass runs.
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const defaultDailyUsdCap = 5;
let warnedCap = false;

/** `GAP_LLM_DAILY_USD_CAP`, or the default when unset, blank or not a finite number: `""` parses
 * as 0 and NaN fails every comparison, and either would block every call. Warns once on a bad
 * value. */
export function dailyUsdCap(): number {
  const raw = process.env.GAP_LLM_DAILY_USD_CAP;
  if (!raw) return defaultDailyUsdCap;
  const parsed = Number(raw);
  if (Number.isFinite(parsed)) return parsed;
  if (!warnedCap) {
    warnedCap = true;
    console.warn(
      `gap LLM pass: GAP_LLM_DAILY_USD_CAP="${raw}" is not a valid number, using the default cap of ${defaultDailyUsdCap} instead`,
    );
  }
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
