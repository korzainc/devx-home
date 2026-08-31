import { headers } from "next/headers";
import { getPool } from "./db";
import { getSession } from "./session";

// Reads for the votes and comments attached to a roadmap entry. Nothing here is cached: a tally
// that lags behind the button you just pressed is worse than no tally, and these are small queries
// behind a Suspense boundary rather than the page itself.

export type VoteDirection = "up" | "down";

export type Tally = { up: number; down: number; comments: number };

export type EntryComment = {
  id: string;
  /** Display name off the user record. A comment with no name against it is not worth having. */
  author: string;
  /** Only ever compared against the viewer, to decide whether they may delete their own comment. */
  authorId: string;
  at: Date;
  body: string;
};

const noTally: Tally = { up: 0, down: 0, comments: 0 };

/** Every entry that has been voted on or commented on, keyed by slug. Absent means nobody has. */
export async function getTallies(): Promise<Map<string, Tally>> {
  const pool = getPool();

  // Two grouped queries rather than a join, because a full outer join between them would need a
  // coalesce on every column to handle an entry that has votes but no comments, or the reverse.
  const [votes, comments] = await Promise.all([
    pool.query<{ slug: string; up: number; down: number }>(
      `select "slug",
              count(*) filter (where "direction" = 'up')::int as up,
              count(*) filter (where "direction" = 'down')::int as down
         from "roadmap_vote"
        group by "slug"`,
    ),
    pool.query<{ slug: string; comments: number }>(
      `select "slug", count(*)::int as comments
         from "roadmap_comment"
        group by "slug"`,
    ),
  ]);

  const tallies = new Map<string, Tally>();
  for (const row of votes.rows) {
    tallies.set(row.slug, { up: row.up, down: row.down, comments: 0 });
  }
  for (const row of comments.rows) {
    const existing = tallies.get(row.slug) ?? { ...noTally };
    tallies.set(row.slug, { ...existing, comments: row.comments });
  }
  return tallies;
}

/** What the signed-in viewer has already voted, keyed by slug. Empty when nobody is signed in. */
async function getMyVotes(
  userId: string | null,
): Promise<Map<string, VoteDirection>> {
  if (!userId) return new Map();

  const { rows } = await getPool().query<{
    slug: string;
    direction: VoteDirection;
  }>(`select "slug", "direction" from "roadmap_vote" where "userId" = $1`, [
    userId,
  ]);

  return new Map(rows.map((row) => [row.slug, row.direction]));
}

export type BoardState = {
  signedIn: boolean;
  tallies: Map<string, Tally>;
  yours: Map<string, VoteDirection>;
};

/** Everything the card grid needs, in one request-time read shared by all four stage bands. */
export async function getBoardState(): Promise<BoardState> {
  // Awaited on its own rather than left to getSession, so the session lookup can start alongside
  // the tally instead of ahead of it. See getDiscussion for why it has to come first at all.
  await headers();

  const [session, tallies] = await Promise.all([getSession(), getTallies()]);
  const userId = session?.user.id ?? null;

  // The only read that needs the session resolved first, and it is skipped entirely when nobody is
  // signed in, which is most of the traffic to a public roadmap.
  return { signedIn: !!userId, tallies, yours: await getMyVotes(userId) };
}

export type Discussion = {
  viewerId: string | null;
  tally: Tally;
  yours: VoteDirection | null;
  comments: EntryComment[];
};

/** Everything one entry page needs below its body. */
export async function getDiscussion(slug: string): Promise<Discussion> {
  // Before getPool, and the order matters for the same reason it does inside getSession: reading
  // headers is what tells Next this render is request-time, so a prerender bails out here rather
  // than in the pool, which would make `next build` demand a database connection string.
  //
  // Read here rather than by awaiting getSession first, because neither query below depends on who
  // is asking: both fetch the whole entry and the viewer is picked out of the rows afterwards.
  // Awaiting the session ahead of them put a second Neon round trip on the critical path, roughly
  // 240ms of it, for nothing.
  await headers();
  const pool = getPool();

  const [session, votes, comments] = await Promise.all([
    getSession(),
    pool.query<{ direction: VoteDirection; userId: string }>(
      `select "direction", "userId" from "roadmap_vote" where "slug" = $1`,
      [slug],
    ),
    pool.query<{
      id: string;
      body: string;
      createdAt: Date;
      userId: string;
      name: string;
    }>(
      `select c."id", c."body", c."createdAt", c."userId", u."name"
         from "roadmap_comment" c
         join "user" u on u."id" = c."userId"
        where c."slug" = $1
        order by c."createdAt"`,
      [slug],
    ),
  ]);

  const viewerId = session?.user.id ?? null;

  // Counted here rather than in SQL because the viewer's own vote comes out of the same rows, and
  // an entry's vote count is small enough that fetching it whole costs nothing.
  const tally: Tally = {
    up: votes.rows.filter((row) => row.direction === "up").length,
    down: votes.rows.filter((row) => row.direction === "down").length,
    comments: comments.rows.length,
  };

  return {
    viewerId,
    tally,
    yours: votes.rows.find((row) => row.userId === viewerId)?.direction ?? null,
    comments: comments.rows.map((row) => ({
      id: row.id,
      author: row.name,
      authorId: row.userId,
      at: row.createdAt,
      body: row.body,
    })),
  };
}
