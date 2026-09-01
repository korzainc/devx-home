"use client";

import Link from "next/link";
import { CatalogueGrid } from "@/components/catalogue-grid";
import {
  describeVersion,
  rivalPlugins,
  skillFacets,
  versionStatusFor,
  type SkillEntry,
} from "@/lib/catalogue";

// A skill is not installable alone, so the card links to the plugin that ships it.
function SkillCard({ skill }: { skill: SkillEntry }) {
  const planned = skill.status === "Planned";
  const pin = versionStatusFor(skill.plugin);
  const rivals = rivalPlugins(skill);

  return (
    <Link
      href={`/skills/${skill.plugin}`}
      className="group flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-raised"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex items-baseline gap-1.5">
          <span className="font-mono text-sm font-medium text-ink group-hover:text-accent">
            /{skill.name}
          </span>
          {rivals.length > 0 && (
            <span
              title={`Also claimed by ${rivals.join(", ")}`}
              className="rounded border border-line-strong px-1 py-0.5 font-mono text-[0.55rem] text-ink-muted"
            >
              also in {rivals.join(", ")}
            </span>
          )}
        </span>
        {planned ? (
          <span className="shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[0.6rem] tracking-wide text-ink-faint uppercase">
            Planned
          </span>
        ) : (
          <span className="shrink-0 font-mono text-[0.65rem] text-ink-faint">
            {skill.plugin}
          </span>
        )}
      </div>

      <p className="line-clamp-3 flex-1 text-sm leading-relaxed text-ink-muted">
        {skill.summary}
      </p>

      {/* Pin state rides along: 36 of the 51 live skills come from a plugin that is unpinned or
          has no releases. Skipped for Planned skills, which have nothing pinned yet. */}
      <div className="flex items-center gap-1.5 font-mono text-[0.65rem] text-ink-faint">
        <span className="rounded border border-line px-1.5 py-0.5 text-ink-muted">
          {skill.category}
        </span>
        <span>{skill.origin}</span>
        {!planned && pin && (
          <>
            <span aria-hidden>·</span>
            <span className={pin.state === "current" ? "" : "text-ink-muted"}>
              {describeVersion(pin)}
            </span>
          </>
        )}
        <span className="ml-auto group-hover:text-accent">
          {planned ? "intended plugin →" : "how to install →"}
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
      unclassifiedNote="These configure a plugin or describe the toolchain itself rather than doing a job, so the filters above do not apply to them. Search still finds them."
    />
  );
}
