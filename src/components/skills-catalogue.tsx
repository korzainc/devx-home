"use client";

import Link from "next/link";
import { CatalogueGrid } from "@/components/catalogue-grid";
import { skillFacets, type SkillEntry } from "@/lib/catalogue";

// Category, origin and pin state are facets, not card text: after filtering they read the same
// on every card. What stays is the command, what it does, the plugin you install to get it,
// and the runtimes that can run it.
function SkillCard({ skill }: { skill: SkillEntry }) {
  const planned = skill.status === "Planned";
  // "Claude Code" -> "claude": short enough to sit opposite the plugin on one line.
  const agents = skill.agents.map((a) => a.split(" ")[0].toLowerCase());

  return (
    <Link
      href={`/skills/${skill.plugin}`}
      className="group relative flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-4 pb-5 transition-colors hover:border-line-strong hover:bg-surface-raised"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="font-mono text-[0.9375rem] leading-snug font-medium text-ink [overflow-wrap:anywhere]">
          <span className="text-accent">/</span>
          {skill.name}
        </span>
        {planned && (
          <span className="mt-0.5 shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[0.6rem] tracking-wide text-ink-faint uppercase">
            Planned
          </span>
        )}
      </div>

      <p className="text-[0.8125rem] leading-relaxed text-ink-muted">
        {skill.summary || skill.description}
      </p>

      {/* Plugin left, runtimes right. Claude Code is on all 48, so it says nothing alone --
          the signal is whether codex sits beside it, since 21 of these cannot run there. */}
      <div className="mt-auto flex items-baseline justify-between gap-3 pt-1 font-mono text-[0.65rem]">
        <span className="truncate text-ink-muted">{skill.plugin}</span>
        <span className="shrink-0 text-ink-faint">{agents.join(" · ")}</span>
      </div>
    </Link>
  );
}

export function SkillsCatalogue({
  entries,
  toolchain = [],
}: {
  entries: SkillEntry[];
  /** Setup and meta skills: listed, searchable, never faceted. */
  toolchain?: SkillEntry[];
}) {
  return (
    <CatalogueGrid
      entries={entries}
      facets={skillFacets}
      searchLabel="What are you trying to do?"
      noun="skill"
      renderCard={(skill) => <SkillCard skill={skill} />}
      unclassified={toolchain}
      unclassifiedLabel="Setup and toolchain"
      unclassifiedNote="These set up a plugin or describe the toolchain itself rather than doing a job, so the filters do not apply to them. Search still finds them."
    />
  );
}
