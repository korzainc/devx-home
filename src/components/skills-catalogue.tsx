"use client";

import Link from "next/link";
import { CatalogueGrid } from "@/components/catalogue-grid";
import { shortAgents, skillFacets, type SkillEntry } from "@/lib/catalogue";

// Category and origin are facets, not card text: after filtering they read the same on every card.
function SkillCard({ skill }: { skill: SkillEntry }) {
  const agents = shortAgents(skill.agents);

  return (
    <Link
      href={`/skills/${skill.plugin}#${skill.name}`}
      className="group flex h-full flex-col rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-raised"
    >
      <span className="font-mono text-[0.9375rem] leading-snug font-medium text-ink [overflow-wrap:anywhere]">
        <span className="text-accent">/</span>
        {skill.name}
      </span>

      <p className="mt-2.5 mb-4 text-[0.8125rem] leading-relaxed text-ink-muted">
        {skill.summary ?? skill.description}
      </p>

      {/* Claude Code is on every skill, so it says nothing alone: the signal is whether codex
          sits beside it. */}
      <div className="mt-auto flex items-baseline justify-between gap-3 border-t border-line pt-3.5 font-mono text-[0.65rem] text-ink-faint">
        <span className="shrink-0">{agents.join(" · ")}</span>
        <span className="truncate transition-colors group-hover:text-accent">
          {skill.plugin}
        </span>
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
      unclassifiedNote="These configure a plugin or describe the toolchain itself — filters above do not apply, search still finds them."
    />
  );
}
