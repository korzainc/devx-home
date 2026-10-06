-- Consent-only devices are self-reported installations, never company accounts.
alter table telemetry_devices alter column user_id drop not null;
alter table telemetry_devices add column identity_kind text not null default 'github'
  check (identity_kind in ('github', 'consent'));
alter table telemetry_devices add constraint telemetry_device_identity
  check ((identity_kind = 'github' and user_id is not null)
    or (identity_kind = 'consent' and user_id is null));
alter table telemetry_devices add column window_started_at timestamptz not null default now();
alter table telemetry_devices add column window_records integer not null default 0
  check (window_records >= 0);
create index telemetry_devices_created_idx on telemetry_devices(created_at)
  where identity_kind = 'consent';

-- Keep provenance after a device is deleted; legacy pilot rows have no identity proof.
alter table telemetry_events add column identity_kind text not null default 'legacy'
  check (identity_kind in ('legacy', 'github', 'consent'));
alter table telemetry_skill_metrics add column identity_kind text not null default 'legacy'
  check (identity_kind in ('legacy', 'github', 'consent'));
update telemetry_events e set identity_kind = d.identity_kind
  from telemetry_devices d where d.device_id = e.device_id;
update telemetry_skill_metrics m set identity_kind = d.identity_kind
  from telemetry_devices d where d.device_id = m.device_id;
