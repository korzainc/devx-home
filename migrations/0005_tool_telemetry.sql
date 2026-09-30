create table telemetry_events (
  event_id text primary key,
  kind text not null check (kind in ('plugin_installed', 'skill_activated')),
  occurred_at timestamptz not null,
  plugin text not null,
  skill text
);
create table telemetry_skill_metrics (
  stream_id text primary key,
  value bigint not null check (value >= 0),
  temporality smallint not null check (temporality in (1, 2)),
  skill text,
  invoke_type text
);
