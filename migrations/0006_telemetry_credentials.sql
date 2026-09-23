-- Device credentials are opt-in, bounded to the membership cache window and individually revocable.
create table telemetry_codes (
  code_hash text primary key,
  user_id text not null references "user"(id) on delete cascade,
  code_challenge text not null,
  redirect_uri text not null,
  expires_at timestamptz not null
);
create index telemetry_codes_expiry_idx on telemetry_codes(expires_at);
create table telemetry_devices (
  device_id uuid primary key,
  user_id text not null references "user"(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
alter table telemetry_codes add column device_id uuid references telemetry_devices(device_id) on delete cascade;
create index telemetry_devices_user_idx on telemetry_devices(user_id);
alter table telemetry_events add column client text not null default 'claude' check(client in ('claude','codex'));
alter table telemetry_events add column source text not null default 'native_otel' check(source in ('native_otel','korza_cli'));
alter table telemetry_events add column device_id uuid references telemetry_devices(device_id) on delete set null;
alter table telemetry_skill_metrics add column plugin text;
alter table telemetry_skill_metrics add column device_id uuid references telemetry_devices(device_id) on delete set null;
