-- Counts claim attempts per user, so `claimDeviceCode` (src/app/device/actions.ts) can cap
-- device-code guessing. Better Auth's own device-authorization rate limiter is attached to the
-- plugin's HTTP route, which is disabled (see src/lib/auth.ts); the server action calls
-- `deviceVerify` through `auth.api` directly, bypassing that route and its limiter entirely.

create table "deviceClaimAttempt" (
  "id" text not null primary key,
  "userId" text not null references "user" ("id") on delete cascade,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null
);

create index "deviceClaimAttempt_userId_createdAt_idx" on "deviceClaimAttempt" ("userId", "createdAt");
