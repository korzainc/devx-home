-- `"userId"` and `"expiresAt"` had no index, unlike every other FK'd column in these migrations.
-- `"userId"` backs the approval lookup the plugin itself does per request; `"expiresAt"` backs
-- the opportunistic cleanup in `src/lib/auth.ts`'s `/device/code` hook.

create index "deviceCode_userId_idx" on "deviceCode" ("userId");

create index "deviceCode_expiresAt_idx" on "deviceCode" ("expiresAt");
