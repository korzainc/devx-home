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
      <Suspense fallback={<DiscussionFallback />}>
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

/* Holds the vote bar's height so the page does not shift when the counts arrive. The comments
   below it have no height to reserve, since their number is what is being loaded. */
function DiscussionFallback() {
  return <div className="h-[74px] rounded-xl border border-line bg-surface" />;
}
