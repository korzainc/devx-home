-- Votes and comments on roadmap entries.
--
-- `slug` is a roadmap filename, not a foreign key: entries live in content/roadmap as markdown, so
-- there is no table to point at. The server actions check the slug against those files before
-- writing, and an entry that is renamed or deleted leaves rows that no page reads.
--
-- A vote stores who cast it because one vote per person is the only thing that makes the tally
-- worth reading. It is never displayed with a name. Changing that is a query change, not a
-- migration, which is the point of keeping the column.

create table "roadmap_vote" (
  "id" text not null primary key,
  "slug" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "direction" text not null check ("direction" in ('up', 'down')),
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null,
  "updatedAt" timestamptz default CURRENT_TIMESTAMP not null
);

create table "roadmap_comment" (
  "id" text not null primary key,
  "slug" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "body" text not null,
  "createdAt" timestamptz default CURRENT_TIMESTAMP not null
);

-- Switching an up vote to a down vote is an upsert on this index, so the constraint enforces the
-- one-per-person rule rather than the application remembering to.
create unique index "roadmap_vote_slug_userId_uidx" on "roadmap_vote" ("slug", "userId");

create index "roadmap_vote_slug_idx" on "roadmap_vote" ("slug");

create index "roadmap_comment_slug_createdAt_idx" on "roadmap_comment" ("slug", "createdAt");
