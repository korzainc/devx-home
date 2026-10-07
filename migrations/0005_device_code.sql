-- Better Auth's device-authorization plugin (RFC 8628 CLI login). Column list and types come
-- straight off the plugin's own schema in
-- node_modules/better-auth/dist/plugins/device-authorization/schema.mjs - this is a hand-written
-- migration, since this repo has no Better Auth CLI generator step.
--
-- "userId" is nullable because a device code starts unowned: it is created before anyone has
-- signed in to approve it, and only gets a userId once that happens.

create table "deviceCode" (
  "id" text not null primary key,
  "deviceCode" text not null,
  "userCode" text not null,
  "userId" text references "user" ("id") on delete cascade,
  "expiresAt" timestamptz not null,
  "status" text not null,
  "lastPolledAt" timestamptz,
  "pollingInterval" integer,
  "clientId" text,
  "scope" text
);

create unique index "deviceCode_deviceCode_uidx" on "deviceCode" ("deviceCode");

create unique index "deviceCode_userCode_uidx" on "deviceCode" ("userCode");
