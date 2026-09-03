"use client";

import Link from "next/link";
import { CatalogueGrid } from "@/components/catalogue-grid";
import {
  shortAgents,
  type Facet,
  type PluginEntry,
} from "@/lib/catalogue-entries";

// Module scope, not inline: the grid memoises on facet identity.
const facets: Facet<PluginEntry>[] = [
  { key: "agents", label: "Agent" },
  { key: "origin", label: "Origin" },
];

function PluginCard({
  plugin,
  skillCount,
}: {
  plugin: PluginEntry;
  skillCount: number;
}) {
  const agents = shortAgents(plugin.agents);

  return (
    <Link
      href={`/skills/${plugin.id}`}
      className="group flex h-full flex-col rounded-xl border border-line bg-surface p-5 transition-colors hover:border-line-strong hover:bg-surface-raised"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[0.9375rem] font-medium text-ink group-hover:text-accent">
          {plugin.name}
        </span>
        <span className="shrink-0 font-mono text-[0.65rem] text-ink-faint">
          {skillCount} {skillCount === 1 ? "skill" : "skills"}
        </span>
      </div>

      <p className="mt-2.5 mb-4 line-clamp-2 text-[0.8125rem] leading-relaxed text-ink-muted">
        {plugin.summary}
      </p>

      <div className="mt-auto flex items-baseline justify-between gap-3 border-t border-line pt-3.5 font-mono text-[0.65rem] text-ink-faint">
        <span className="shrink-0">{agents.join(" · ")}</span>
        <span className="shrink-0 transition-colors group-hover:text-accent">
          why use it →
        </span>
      </div>
    </Link>
  );
}

export function PluginsCatalogue({
  entries,
  skillCounts = {},
}: {
  entries: PluginEntry[];
  skillCounts?: Record<string, number>;
}) {
  return (
    <CatalogueGrid
      noun="plugin"
      entries={entries}
      facets={facets}
      searchLabel="Filter plugins"
      renderCard={(plugin) => (
        <PluginCard plugin={plugin} skillCount={skillCounts[plugin.id] ?? 0} />
      )}
    />
  );
}
