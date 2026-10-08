-- Better Auth's device-authorization plugin (RFC 8628 CLI login). Column list and types
-- come from the plugin's own schema; hand-written since this repo has no Better Auth CLI
-- generator step.
--
-- "userId" is nullable because a device code starts unowned: it gets one only once
-- someone signs in to approve it.

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
