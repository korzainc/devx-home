"use client";

import Link from "next/link";
import { CatalogueGrid } from "@/components/catalogue-grid";
import type { BundleEntry, Facet, ToolEntry } from "@/lib/catalogue";

// Module scope, not inline: the grid memoises on facet identity.
const facets: Facet<ToolEntry>[] = [
  { key: "category", label: "Category" },
  { key: "capabilities", label: "Capability" },
  { key: "stacks", label: "Stack" },
];

function ToolCard({ tool }: { tool: ToolEntry | BundleEntry }) {
  return (
    <Link
      href={`/tools/${tool.id}`}
      className="group flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-surface-raised"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium text-ink group-hover:text-accent">
          {tool.name}
        </h3>
        <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5 font-mono text-[0.65rem] text-ink-faint">
          {tool.category}
        </span>
      </div>

      <p className="flex-1 text-sm leading-relaxed text-ink-muted">
        {tool.summary}
      </p>

      <ul className="flex flex-wrap gap-1.5">
        {tool.capabilities.map((capability) => (
          <li
            key={capability}
            className="rounded bg-accent-wash px-1.5 py-0.5 font-mono text-[0.65rem] text-ink-muted"
          >
            {capability}
          </li>
        ))}
      </ul>
    </Link>
  );
}

export function ToolsCatalogue({
  entries,
}: {
  entries: (ToolEntry | BundleEntry)[];
}) {
  return (
    <CatalogueGrid
      entries={entries}
      facets={facets}
      searchLabel="Filter tools"
      renderCard={(tool) => <ToolCard tool={tool} />}
    />
  );
}
