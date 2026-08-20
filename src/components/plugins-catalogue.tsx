"use client";

import Link from "next/link";
import { CatalogueGrid } from "@/components/catalogue-grid";
import type { Facet, PluginEntry } from "@/lib/catalogue";

// Module scope, not inline: the grid memoises on facet identity.
const facets: Facet<PluginEntry>[] = [
  { key: "agents", label: "Agent" },
  { key: "origin", label: "Origin" },
  { key: "versioning", label: "Version" },
];

// The card is a way in, not a summary of everything known about the plugin. The problem it solves,
// the benefits, the full skill list and the install commands all live on the detail page.
function PluginCard({ plugin }: { plugin: PluginEntry }) {
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

      <p className="line-clamp-2 flex-1 text-sm leading-relaxed text-ink-muted">
        {plugin.summary}
      </p>

      <div className="flex items-center gap-1.5 pt-1 font-mono text-[0.65rem] text-ink-faint">
        {plugin.skills.length > 0 && (
          <>
            <span>
              {plugin.skills.length}{" "}
              {plugin.skills.length === 1 ? "skill" : "skills"}
            </span>
            <span aria-hidden>·</span>
          </>
        )}
        <span>{plugin.agents.join(", ")}</span>
        <span className="ml-auto group-hover:text-accent">why use it →</span>
      </div>
    </Link>
  );
}

export function PluginsCatalogue({ entries }: { entries: PluginEntry[] }) {
  return (
    <CatalogueGrid
      entries={entries}
      facets={facets}
      searchLabel="Filter plugins"
      renderCard={(plugin) => <PluginCard plugin={plugin} />}
    />
  );
}
