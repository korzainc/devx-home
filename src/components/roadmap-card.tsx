import Link from "next/link";
import type {
  RoadmapCategory,
  RoadmapEntry,
  RoadmapStage,
} from "@/lib/roadmap";

/* Colour says how committed we are: quiet while it is still a question, ink once it is agreed,
   accent while it is being built, green once it has landed. Same chip shape as the gap report's
   present and missing states. */
const stageChip: Record<RoadmapStage, string> = {
  exploring: "border-line bg-surface text-ink-muted",
  planned: "border-line-strong bg-surface text-ink",
  building: "border-accent bg-accent-wash text-accent",
  shipped: "border-positive bg-positive-wash text-positive",
};

export function StageChip({ stage }: { stage: RoadmapStage }) {
  return (
    <span
      className={`shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[0.65rem] ${stageChip[stage]}`}
    >
      {stage}
    </span>
  );
}

/* On a card the stage is already the section heading, so the tag names the part of the portal the
   entry touches instead. That is also what the filter above each section runs on. */
export function CategoryTag({ category }: { category: RoadmapCategory }) {
  return (
    <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5 font-mono text-[0.65rem] text-ink-muted">
      {category}
    </span>
  );
}

const monthFormat = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function landedLabel(landed: string) {
  return monthFormat.format(new Date(`${landed}-01T00:00:00Z`));
}

/* Fixed height, with the title and summary clamped rather than allowed to set it. A card that
   grows with its text makes a wordy entry look more important than a terse one, which is not the
   ranking we mean.

   Shipped is the same card pointing somewhere else: the write-up is already on /updates, and two
   copies of it would be two things to keep right. The footer slot is where the vote controls go
   once there is somewhere to store a vote. */
export function RoadmapCard({ entry }: { entry: RoadmapEntry }) {
  const isShipped = entry.stage === "shipped";

  return (
    <article className="relative flex h-48 flex-col gap-2 overflow-hidden rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong">
      <div className="flex items-baseline justify-between gap-3">
        <CategoryTag category={entry.category} />
        {isShipped && entry.landed ? (
          <span className="shrink-0 font-mono text-xs text-ink-faint">
            {landedLabel(entry.landed)}
          </span>
        ) : null}
      </div>

      <h3 className="line-clamp-2 font-medium text-ink">
        <Link
          href={isShipped ? "/updates" : `/roadmap/${entry.slug}`}
          className="after:absolute after:inset-0"
        >
          {entry.title}
        </Link>
      </h3>

      <p className="line-clamp-2 text-sm leading-relaxed text-ink-muted">
        {entry.summary}
      </p>

      <div className="mt-auto text-sm font-medium text-accent">
        {isShipped ? "Read the update →" : "Read more →"}
      </div>
    </article>
  );
}
