-- Content-addressed cache for the gap-analysis LLM pass, and a running daily spend total used to
-- enforce GAP_LLM_DAILY_USD_CAP. No repo/commit column: RepoSnapshot carries no commit SHA, so a
-- key on the exact capped prompt text is the only one that can't silently go stale.
--
-- snake_case table names with quoted camelCase columns, matching 0002's convention
-- ("roadmap_vote" with "userId", "createdAt").

create table "gap_llm_cache" (
  "key" text primary key,
  "model" text not null,
  "response" jsonb not null,
  "inputTokens" integer not null,
  "outputTokens" integer not null,
  "createdAt" timestamptz not null default now()
);

create table "gap_llm_daily_spend" (
  "day" date primary key,
  "usd" numeric(10, 4) not null default 0
);
