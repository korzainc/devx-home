-- The gate's second question: not just "is this person signed in" but "is this person one of us".
--
-- Stored rather than asked on every request, because the answer costs a call to GitHub and the
-- gate runs on every page. `orgCheckedAt` is what makes it safe to cache: null means never asked,
-- and an old timestamp means ask again, so somebody who leaves the organisation loses access on
-- the next check rather than never.
--
-- Defaulting to false means every row that exists today starts denied and is re-checked on its
-- owner's next request. That is the right direction to fail: the six accounts already in this
-- table signed in before there was a gate, and at least one is from outside the organisation.

alter table "user" add column "orgMember" boolean not null default false;

alter table "user" add column "orgCheckedAt" timestamptz;
