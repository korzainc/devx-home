-- Repository and run identity only; no user or source-code data.
create table gap_analysis_runs (
  run_id uuid primary key,
  repo_id bigint not null check (repo_id > 0),
  recorded_at timestamptz not null default now()
);
create index gap_analysis_runs_repo_id on gap_analysis_runs(repo_id);

-- Consent-only devices are installations, never company accounts.
create table telemetry_devices (
  device_id uuid primary key,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  identity_kind text not null default 'consent' check (identity_kind in ('github', 'consent')),
  window_started_at timestamptz not null default now(),
  window_records integer not null default 0 check (window_records >= 0)
);
create index telemetry_devices_created_idx on telemetry_devices(created_at)
  where identity_kind = 'consent';

create table telemetry_events (
  event_id text primary key,
  kind text not null check (kind in ('plugin_installed', 'skill_activated')),
  occurred_at timestamptz not null,
  plugin text not null,
  skill text,
  client text not null default 'claude' check (client in ('claude', 'codex')),
  source text not null default 'native_otel' check (source in ('native_otel', 'korza_cli')),
  device_id uuid references telemetry_devices(device_id) on delete set null,
  identity_kind text not null default 'legacy' check (identity_kind in ('legacy', 'github', 'consent'))
);
create index telemetry_events_plugin_kind_skill_idx
  on telemetry_events(plugin, kind, skill) include (client, source);
create index telemetry_events_device_idx on telemetry_events(device_id);

create table telemetry_skill_metrics (
  stream_id text primary key,
  value bigint not null check (value >= 0),
  temporality smallint not null check (temporality in (1, 2)),
  skill text,
  invoke_type text,
  plugin text,
  device_id uuid references telemetry_devices(device_id) on delete set null,
  identity_kind text not null default 'legacy' check (identity_kind in ('legacy', 'github', 'consent'))
);
create index telemetry_skill_metrics_skill_plugin_idx
  on telemetry_skill_metrics(skill, plugin) include (value);
create index telemetry_skill_metrics_device_idx on telemetry_skill_metrics(device_id);
