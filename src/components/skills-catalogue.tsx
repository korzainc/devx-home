"use client";

import Link from "next/link";
import { CatalogueGrid } from "@/components/catalogue-grid";
import { rivalPlugins, skillFacets, type SkillEntry } from "@/lib/catalogue";

// Category, origin and pin state are facets, not card text: after filtering they read the same
// on every card. What stays is the command, what it does, and a marker only where a skill is
// unusual — planned, or claimed by two plugins.
function SkillCard({ skill }: { skill: SkillEntry }) {
  const planned = skill.status === "Planned";
  const rivals = rivalPlugins(skill);

  return (
    <Link
      href={`/skills/${skill.plugin}`}
      className="group relative flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-4 pb-7 transition-colors hover:border-line-strong hover:bg-surface-raised"
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

      {/* Two lines reserved: 75 characters is three at this width, but the written ones run to
          68, so two is the common case and the rare third line grows its row. */}
      <p className="min-h-[2.6rem] text-[0.8125rem] leading-relaxed text-ink-muted">
        {skill.summary || skill.description}
      </p>

      {rivals.length > 0 && (
        <span
          title={`Also claimed by ${rivals.join(", ")}`}
          className="absolute bottom-2.5 left-4 max-w-[calc(100%-3rem)] truncate font-mono text-[0.65rem] text-ink-faint"
        >
          also in {rivals.join(", ")}
        </span>
      )}

      <span
        aria-hidden
        className="absolute right-4 bottom-2.5 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100"
      >
        →
      </span>
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
