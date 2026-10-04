-- Response cache and daily spend tally for the gap-analysis LLM pass.

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
