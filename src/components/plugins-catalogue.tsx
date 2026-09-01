"use client";

import Link from "next/link";
import { CatalogueGrid } from "@/components/catalogue-grid";
import {
  describeVersion,
  skillsForPlugin,
  versionStatusFor,
  type Facet,
  type PluginRow,
  type VersionStatus,
} from "@/lib/catalogue";

// Module scope, not inline: the grid memoises on facet identity.
const facets: Facet<PluginRow>[] = [
  { key: "pinState", label: "Pin" },
  { key: "agents", label: "Agent" },
  { key: "origin", label: "Origin" },
];

// Severity, not a boolean: every entry is non-current, so one emphasis carried no signal.
const UNKNOWN_TONE = "border-line text-ink-faint";

const TONE: Record<VersionStatus["state"], string> = {
  "no-releases": "border-line-strong bg-accent-wash text-ink",
  unpinned: "border-line-strong text-ink",
  behind: "border-line text-ink-muted",
  current: "border-line text-ink-faint",
};

function PluginCard({ plugin }: { plugin: PluginRow }) {
  const version = versionStatusFor(plugin.id);
  // From the index, never plugin.skills, which says 0 for codezen. Planned shown, or codezen
  // reads 17 on the Skills tab and 11 here with nothing explaining the gap.
  const pluginSkills = skillsForPlugin(plugin.id);
  const skillCount = pluginSkills.filter(
    (skill) => skill.status !== "Planned",
  ).length;
  const plannedCount = pluginSkills.length - skillCount;

  return (
    <Link
      href={`/skills/${plugin.id}`}
      className="group flex h-full flex-col gap-2 rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-raised"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-sm font-medium text-ink group-hover:text-accent">
          {plugin.name}
        </span>
        <span className="shrink-0 font-mono text-[0.65rem] text-ink-faint">
          {plugin.ref}
        </span>
      </div>

      {version && (
        <span
          className={`w-fit rounded border px-1.5 py-0.5 font-mono text-[0.6rem] ${TONE[version.state] ?? UNKNOWN_TONE}`}
        >
          {describeVersion(version)}
        </span>
      )}

      <p className="line-clamp-2 flex-1 text-sm leading-relaxed text-ink-muted">
        {plugin.summary}
      </p>

      <div className="flex items-center gap-1.5 pt-1 font-mono text-[0.65rem] text-ink-faint">
        <span>
          {skillCount} {skillCount === 1 ? "skill" : "skills"}
          {plannedCount > 0 && ` + ${plannedCount} planned`}
        </span>
        <span aria-hidden>·</span>
        <span>{plugin.agents.join(", ")}</span>
        <span className="ml-auto group-hover:text-accent">why use it →</span>
      </div>
    </Link>
  );
}

export function PluginsCatalogue({ entries }: { entries: PluginRow[] }) {
  return (
    <CatalogueGrid
      entries={entries}
      facets={facets}
      searchLabel="Filter plugins"
      renderCard={(plugin) => <PluginCard plugin={plugin} />}
    />
  );
}
