-- Only repository identity and run identity; no user or source-code data.
create table "gap_analysis_runs" (
  "run_id" uuid primary key,
  "repo_id" bigint not null check (repo_id > 0),
  "recorded_at" timestamptz not null default now()
);
create index "gap_analysis_runs_repo_id" on "gap_analysis_runs" ("repo_id");
