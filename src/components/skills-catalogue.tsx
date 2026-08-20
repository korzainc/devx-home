"use client";

import { CatalogueGrid } from "@/components/catalogue-grid";
import type { Facet, SkillEntry } from "@/lib/catalogue";

// Module scope, not inline: the grid memoises on facet identity.
const facets: Facet<SkillEntry>[] = [
  { key: "category", label: "Category" },
  { key: "agents", label: "Agent" },
];

const agentLabels: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
};

function SkillCard({ skill }: { skill: SkillEntry }) {
  return (
    <a
      href={skill.marketplaceUrl}
      target="_blank"
      rel="noreferrer"
      className="group flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-surface-raised"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium text-ink group-hover:text-accent">
          {skill.name}
        </h3>
        <span className="shrink-0 rounded-md border border-line px-1.5 py-0.5 font-mono text-[0.65rem] text-ink-faint">
          {skill.category}
        </span>
      </div>

      <p className="flex-1 text-sm leading-relaxed text-ink-muted">
        {skill.summary}
      </p>

      <div className="flex items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-1.5">
          {skill.agents.map((agent) => (
            <li
              key={agent}
              className="rounded bg-accent-wash px-1.5 py-0.5 font-mono text-[0.65rem] text-ink-muted"
            >
              {agentLabels[agent] ?? agent}
            </li>
          ))}
        </ul>
        <span className="font-mono text-[0.65rem] text-ink-faint group-hover:text-accent">
          marketplace →
        </span>
      </div>
    </a>
  );
}

export function SkillsCatalogue({ entries }: { entries: SkillEntry[] }) {
  return (
    <CatalogueGrid
      entries={entries}
      facets={facets}
      searchLabel="Filter skills"
      renderCard={(skill) => <SkillCard skill={skill} />}
    />
  );
}
