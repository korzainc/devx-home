"use client";

import { CatalogueCard } from "@/components/catalogue-card";
import { CatalogueGrid } from "@/components/catalogue-grid";
import {
  shortAgents,
  skillFacets,
  type SkillEntry,
} from "@/lib/catalogue-entries";
import { skillLink } from "@/lib/skill-link";

// Category and origin are facets, not card text: after filtering they read the same on every card.
function SkillCard({ skill }: { skill: SkillEntry }) {
  const agents = shortAgents(skill.agents);

  return (
    <CatalogueCard
      href={skillLink(skill.plugin, skill.name)}
      name={
        <span className="font-mono text-[0.9375rem] leading-snug font-medium text-ink [overflow-wrap:anywhere]">
          <span className="text-accent">/</span>
          {skill.name}
        </span>
      }
      summary={skill.summary ?? skill.description}
      /* Claude Code is on every skill, so it says nothing alone: the signal is whether codex
         sits beside it. */
      footerLeft={<span className="shrink-0">{agents.join(" · ")}</span>}
      footerRight={
        <span className="truncate transition-colors group-hover:text-accent">
          {skill.plugin}
        </span>
      }
    />
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
