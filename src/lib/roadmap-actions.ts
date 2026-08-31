"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getPool } from "./db";
import { getRoadmapEntry } from "./roadmap";
import { getSession } from "./session";

// Writes for the votes and comments on a roadmap entry. Every one of these starts from a form post
// by someone who may not be signed in, may have edited the form, and may be pointing at a slug
// that no longer exists, so each argument is checked here rather than trusted from the caller.

const maxCommentLength = 2000;

/**
 * The user id, or a redirect to sign in.
 *
 * The visible controls already send a signed-out reader to GitHub with a return path, so reaching
 * here without a session means the session expired between the page rendering and the form post.
 */
async function requireUser(): Promise<string> {
  const session = await getSession();
  if (session) return session.user.id;
  redirect("/login");
}

/**
 * Entries are markdown files, so a slug is only real if one is on disk. Without this an edited
 * form could fill the table with rows keyed to entries that never existed.
 */
function requireSlug(formData: FormData): string {
  const slug = formData.get("slug");
  if (typeof slug !== "string" || !getRoadmapEntry(slug)) {
    throw new Error("Unknown roadmap entry.");
  }
  return slug;
}

/**
 * Casting the vote you already hold removes it, which is the only way to change your mind back to
 * nothing. Casting the other one switches. Delete first, because a no-op delete tells us it was a
 * switch rather than a repeat without a second read.
 */
export async function castVote(formData: FormData) {
  const slug = requireSlug(formData);
  const direction = formData.get("direction");
  if (direction !== "up" && direction !== "down") {
    throw new Error("A vote is either up or down.");
  }

  const userId = await requireUser();
  const pool = getPool();

  const undone = await pool.query(
    `delete from "roadmap_vote"
      where "slug" = $1 and "userId" = $2 and "direction" = $3`,
    [slug, userId, direction],
  );
  if (undone.rowCount) return;

  await pool.query(
    `insert into "roadmap_vote" ("id", "slug", "userId", "direction")
     values ($1, $2, $3, $4)
     on conflict ("slug", "userId")
     do update set "direction" = excluded."direction", "updatedAt" = now()`,
    [randomUUID(), slug, userId, direction],
  );
}

export async function postComment(formData: FormData) {
  const slug = requireSlug(formData);
  const userId = await requireUser();

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  await getPool().query(
    `insert into "roadmap_comment" ("id", "slug", "userId", "body")
     values ($1, $2, $3, $4)`,
    [randomUUID(), slug, userId, body.slice(0, maxCommentLength)],
  );
}

/**
 * Author only, and enforced in the where clause rather than by reading the row back first. Someone
 * else's comment id simply matches nothing.
 */
export async function deleteComment(formData: FormData) {
  const userId = await requireUser();

  const id = formData.get("id");
  if (typeof id !== "string") throw new Error("No comment to delete.");

  await getPool().query(
    `delete from "roadmap_comment" where "id" = $1 and "userId" = $2`,
    [id, userId],
  );
}
