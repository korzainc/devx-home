"use client";

import { CatalogueCard } from "@/components/catalogue-card";
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
    <CatalogueCard
      href={`/skills/${plugin.id}`}
      name={
        <span className="truncate font-mono text-[0.9375rem] font-medium text-ink group-hover:text-accent">
          {plugin.name}
        </span>
      }
      aside={
        <span className="shrink-0 font-mono text-[0.65rem] text-ink-faint">
          {skillCount === 0 && plugin.payload
            ? plugin.payload
            : `${skillCount} ${skillCount === 1 ? "skill" : "skills"}`}
        </span>
      }
      summary={plugin.summary}
      footerLeft={<span className="shrink-0">{agents.join(" · ")}</span>}
      footerRight={
        <span className="shrink-0 transition-colors group-hover:text-accent">
          why use it →
        </span>
      }
    />
  );
}

export function PluginsCatalogue({
  entries,
  skillCounts,
}: {
  entries: PluginEntry[];
  skillCounts: Record<string, number>;
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
