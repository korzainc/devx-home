import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RoadmapComments } from "@/components/roadmap-comments";
import { CategoryTag, StageChip } from "@/components/roadmap-card";
import { VoteButtons } from "@/components/roadmap-vote";
import { getRoadmap, getRoadmapEntry, type RoadmapStage } from "@/lib/roadmap";
import { getDiscussion } from "@/lib/roadmap-discussion";

export function generateStaticParams() {
  return getRoadmap().map((entry) => ({ slug: entry.slug }));
}

export async function generateMetadata(
  props: PageProps<"/roadmap/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const entry = getRoadmapEntry(slug);
  if (!entry) return {};

  return { title: entry.title, description: entry.summary };
}

export default async function RoadmapEntryPage(
  props: PageProps<"/roadmap/[slug]">,
) {
  const { slug } = await props.params;
  const entry = getRoadmapEntry(slug);
  if (!entry) notFound();

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <Link
        href="/roadmap"
        className="text-sm font-medium text-accent hover:underline"
      >
        ← Roadmap
      </Link>

      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <StageChip stage={entry.stage} />
          <CategoryTag category={entry.category} />
          {entry.outcome ? (
            <span className="text-xs text-ink-faint">{entry.outcome}</span>
          ) : null}
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-balance">
          {entry.title}
        </h1>
        <p className="font-display text-xl leading-snug font-medium tracking-tight text-ink">
          {entry.summary}
        </p>
      </header>

      {/* Repo-authored markdown rendered at build time, so there is no untrusted input here. */}
      <div
        className="prose-body"
        dangerouslySetInnerHTML={{ __html: entry.bodyHtml }}
      />

      {/* The entry's own open question belongs to the entry, not to the comment box. Asked here
          it reads as the team thinking aloud. Asked above the composer it framed every reply
          before anyone had typed. */}
      {entry.question ? (
        <p className="leading-relaxed text-ink">
          <span className="text-ink-faint">Open question. </span>
          {entry.question}
        </p>
      ) : null}

      {/* Votes and comments are read per request, so they sit behind a boundary and the rest of
          the page keeps its prerendered shell. */}
      <Suspense fallback={<DiscussionFallback stage={entry.stage} />}>
        <Discussion slug={entry.slug} stage={entry.stage} />
      </Suspense>
    </div>
  );
}

/* What a vote means depends on how settled the entry is, which is the difference between asking
   for an opinion and asking about priority. Shipped entries get no bar at all: there is nothing
   left to decide, and the thread underneath is the only part still worth having. */
const voteBlurb: Record<Exclude<RoadmapStage, "shipped">, string> = {
  exploring: "Nothing is committed yet. Votes decide what we pick up next.",
  planned: "Already agreed. Votes move it up or down the queue.",
  building: "Already agreed. Votes move it up or down the queue.",
};

async function Discussion({
  slug,
  stage,
}: {
  slug: string;
  stage: RoadmapStage;
}) {
  const { viewerId, tally, yours, comments } = await getDiscussion(slug);
  const here = `/roadmap/${slug}`;

  return (
    <>
      {stage === "shipped" ? null : (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface px-4 py-4">
          <VoteButtons
            slug={slug}
            up={tally.up}
            down={tally.down}
            yours={yours}
            signedIn={!!viewerId}
            here={here}
            size="lg"
          />
          <p className="text-sm text-ink-muted">
            {viewerId
              ? voteBlurb[stage]
              : "Anyone can read the tally. Log in to add to it."}
          </p>
        </div>
      )}

      <RoadmapComments
        slug={slug}
        here={here}
        viewerId={viewerId}
        comments={comments}
      />
    </>
  );
}

/* Holds the shape of what is coming, so the wait reads as loading rather than as an empty box that
   never filled. Every round trip to the database is on this path, and the first one after the
   compute has been idle pays a cold start on top, so it is on screen long enough to matter.

   `stage` is known without touching the database, so a shipped entry reserves no vote bar and does
   not shift when the thread arrives. The comments themselves reserve nothing: their number is the
   thing being loaded. */
function DiscussionFallback({ stage }: { stage: RoadmapStage }) {
  return (
    <>
      {stage === "shipped" ? null : (
        <div className="h-[74px] rounded-xl border border-line bg-surface" />
      )}
      <section className="flex flex-col gap-4 border-t border-line pt-8">
        <h2 className="text-sm font-medium text-ink">Comments</h2>
        {/* The composer and the signed-out panel that replaces it are within about ten pixels of
            each other, so one shape reserves the right room without knowing which is coming. */}
        <div className="flex flex-col items-start gap-3">
          <div className="h-[74px] w-full rounded-lg border border-line bg-canvas" />
          <div className="h-[38px] w-24 rounded-lg border border-line bg-surface" />
        </div>
      </section>
    </>
  );
}
