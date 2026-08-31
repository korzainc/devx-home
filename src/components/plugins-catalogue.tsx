"use client";

import Link from "next/link";
import { CatalogueGrid } from "@/components/catalogue-grid";
import { skillsForPlugin, type Facet, type PluginRow } from "@/lib/catalogue";

// Module scope, not inline: the grid memoises on facet identity.
const facets: Facet<PluginRow>[] = [
  { key: "agents", label: "Agent" },
  { key: "origin", label: "Origin" },
];

function PluginCard({ plugin }: { plugin: PluginRow }) {
  // From the index, never plugin.skills, which says 0 for codezen.
  const skillCount = skillsForPlugin(plugin.id).length;
  const agents = plugin.agents.map((a) => a.split(" ")[0].toLowerCase());

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

      <p className="mt-2.5 line-clamp-2 text-[0.8125rem] leading-relaxed text-ink-muted">
        {plugin.summary}
      </p>

      <div className="mt-auto flex items-baseline justify-between gap-3 border-t border-line pt-3 font-mono text-[0.65rem] text-ink-faint">
        <span className="shrink-0">{agents.join(" · ")}</span>
        <span className="shrink-0 transition-colors group-hover:text-accent">
          why use it →
        </span>
      </div>
    </Link>
  );
}

export function PluginsCatalogue({ entries }: { entries: PluginRow[] }) {
  return (
    <CatalogueGrid
      noun="plugin"
      entries={entries}
      facets={facets}
      searchLabel="Filter plugins"
      renderCard={(plugin) => <PluginCard plugin={plugin} />}
    />
  );
}
