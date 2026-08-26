import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryTag, StageChip } from "@/components/roadmap-card";
import { getRoadmap, getRoadmapEntry } from "@/lib/roadmap";

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

      {/* The question is the whole point of an entry that is still open, so it sits at the end
          where a comment box would go once there is somewhere to put a comment. */}
      {entry.question ? (
        <section className="flex flex-col gap-2 border-t border-line pt-8">
          <h2 className="font-display text-lg font-medium tracking-tight">
            {entry.question}
          </h2>
          <p className="text-sm leading-relaxed text-ink-muted">
            Answers go to #devx in Slack for now. Replying on the page itself is
            waiting on sign-in.
          </p>
        </section>
      ) : null}
    </div>
  );
}
