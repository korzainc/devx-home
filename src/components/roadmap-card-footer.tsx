"use client";

import { use } from "react";
import { VoteButtons } from "@/components/roadmap-vote";
import type { BoardState } from "@/lib/roadmap-discussion";

/* The card grid is a client component so each band can filter itself, which means the board state
   arrives as a promise it unwraps rather than as data awaited on the server. One promise is shared
   by every card, so the whole grid fills from a single pair of queries.

   The counts sit in the footer next to the buttons instead of in the card's top corner, so all of
   the request-time content on a card is behind one Suspense boundary rather than two. */
export function RoadmapCardFooter({
  slug,
  board,
}: {
  slug: string;
  board: Promise<BoardState>;
}) {
  const { signedIn, tallies, yours } = use(board);
  const tally = tallies.get(slug);
  const comments = tally?.comments ?? 0;

  return (
    <>
      <VoteButtons
        slug={slug}
        up={tally?.up ?? 0}
        down={tally?.down ?? 0}
        yours={yours.get(slug) ?? null}
        signedIn={signedIn}
        here="/roadmap"
      />
      <span className="font-mono text-xs text-ink-faint">
        {comments > 0
          ? `${comments} ${comments === 1 ? "comment" : "comments"}`
          : "no comments"}
      </span>
    </>
  );
}

/** Holds the footer's height while the counts load, so the grid does not jump when they arrive. */
export function RoadmapCardFooterFallback() {
  return <span className="h-[34px]" />;
}
