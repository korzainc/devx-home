-- Marks which flow created a session, so a hook can single out device-issued sessions by reading
-- the row itself rather than the partial {expiresAt, updatedAt} that session.update.before hooks
-- receive.

alter table "session" add column "source" text;
