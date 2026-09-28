-- Match the plugin detail page predicates without scanning unrelated history.
create index telemetry_events_plugin_kind_skill_idx
  on telemetry_events(plugin, kind, skill) include (client, source);
create index telemetry_skill_metrics_skill_plugin_idx
  on telemetry_skill_metrics(skill, plugin) include (value);

-- Parent revocation keeps counts, but eventual device/user deletion must also
-- locate referencing rows without scanning every recorded event or stream.
create index telemetry_events_device_idx on telemetry_events(device_id);
create index telemetry_skill_metrics_device_idx on telemetry_skill_metrics(device_id);
create index telemetry_codes_device_idx on telemetry_codes(device_id);
create index telemetry_codes_user_idx on telemetry_codes(user_id);
