import type { Metadata } from "next";
import { RoadmapBand } from "@/components/roadmap-band";
import { getRoadmap, roadmapStages, type RoadmapStage } from "@/lib/roadmap";
import { getBoardState } from "@/lib/roadmap-discussion";

export const metadata: Metadata = {
  title: "Roadmap",
  description:
    "What the DevX team is deciding, has queued, is building and has shipped.",
};

const stageBlurb: Record<RoadmapStage, string> = {
  exploring: "Still a question. Nothing here is committed.",
  planned: "Agreed and queued, in no fixed order.",
  building: "In flight now.",
  shipped: "Landed. The write-up is on the updates page.",
};

/* An empty section is normal rather than a fault, so it says what that means instead of
   apologising. Only Exploring asks for something, because it is the only one anyone outside the
   team can fill. */
const stageEmpty: Record<RoadmapStage, string> = {
  exploring: "Nothing open at the moment. Ask in #devx and it shows up here.",
  planned: "Nothing queued. The next thing we take on comes out of Exploring.",
  building: "Nothing in flight.",
  shipped: "Nothing has landed yet.",
};

export default function RoadmapPage() {
  const entries = getRoadmap();

  // Started here and awaited nowhere on this page, so the header and every card but its footer
  // still prerender. The one promise is shared by all four bands: votes are two queries for the
  // whole board, not two per card.
  const board = getBoardState();

  return (
    <div className="flex flex-col gap-10">
      {/* Same accent bloom the home page sections and the updates header open with. */}
      <header className="relative isolate flex max-w-2xl flex-col gap-3">
        <span
          aria-hidden
          className="absolute -top-10 -left-12 -z-10 h-36 w-96 rounded-full bg-accent/20 blur-3xl"
        />
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Roadmap
        </h1>
        <p className="text-lg leading-relaxed text-ink-muted">
          What the DevX team is deciding, has queued, is building and has
          shipped. No dates: each section says how real the work in it is, and
          every entry that is still a question ends in one.
        </p>
      </header>

      <div className="flex flex-col gap-12">
        {roadmapStages.map((stage) => (
          <RoadmapBand
            key={stage}
            stage={stage}
            blurb={stageBlurb[stage]}
            empty={stageEmpty[stage]}
            entries={entries.filter((entry) => entry.stage === stage)}
            board={board}
          />
        ))}
      </div>
    </div>
  );
}
