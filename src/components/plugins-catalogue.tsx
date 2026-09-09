"use client";

import { useMemo } from "react";
import { CatalogueCard } from "@/components/catalogue-card";
import {
  CatalogueSearch,
  ChipRow,
  ResultCount,
} from "@/components/catalogue-controls";
import { CardGrid, NoMatches } from "@/components/catalogue-results";
import { FacetMenu } from "@/components/facet-menu";
import {
  AUDIENCE_ANY,
  AUDIENCE_PARAM,
  AUDIENCES,
} from "@/data/skill-audiences";
import {
  facetValues,
  shortAgents,
  type Facet,
  type PluginEntry,
} from "@/lib/catalogue-entries";
import { filterEntries, matchesAudience } from "@/lib/filter";
import { useCatalogueFilters } from "@/lib/use-catalogue-filters";

// Module scope, not inline: the filter memoises on facet identity.
const facets: Facet<PluginEntry>[] = [
  { key: "agents", label: "Agent" },
  { key: "origin", label: "Origin" },
];

const PARAMS: Record<string, string> = { agents: "agent", origin: "origin" };

// Audience is the same open axis the skills panel carries, so switching tab does not change what
// the reader is being asked. Both panels stay mounted and both own the param, which is the other
// half of why this one does not sync to the URL.

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
          {skillCount} {skillCount === 1 ? "skill" : "skills"}
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
  const facetOptions = useMemo(
    () =>
      facets.map((facet) => {
        const counts = new Map<string, number>();
        for (const entry of entries) {
          for (const value of facetValues(entry, facet.key)) {
            counts.set(value, (counts.get(value) ?? 0) + 1);
          }
        }
        return {
          ...facet,
          param: PARAMS[facet.key],
          options: [...counts].sort((a, b) => a[0].localeCompare(b[0])),
        };
      }),
    [entries],
  );

  const audienceOptions = useMemo(() => {
    const present = new Set(entries.flatMap((entry) => entry.audiences));
    return AUDIENCES.filter((value) => present.has(value));
  }, [entries]);

  const axes = useMemo(
    () => [
      ...facetOptions.map((facet) => ({
        param: facet.param,
        valid: facet.options.map(([value]) => value),
      })),
      { param: AUDIENCE_PARAM, valid: [...audienceOptions] },
    ],
    [facetOptions, audienceOptions],
  );

  // Not synced to the URL, unlike the skills panel beside it. Both panels stay mounted and both
  // carry an `agent` and an `origin` axis, so syncing here would have the hidden one strip the
  // visible one's params on every click. Skills keeps the sync because it has 48 rows worth
  // linking a filtered view of; this has four, and a link to it is a link to the tab.
  const { query, setQuery, picked, pickedFor, toggle } = useCatalogueFilters({
    axes,
    sync: false,
  });

  // Keyed by facet key rather than by param, which is what the shared rule matches on.
  const selected = useMemo(
    () =>
      Object.fromEntries(
        facets.map((facet) => [facet.key, picked[PARAMS[facet.key]] ?? []]),
      ),
    [picked],
  );

  const pickedAudiences = pickedFor(AUDIENCE_PARAM);

  const visible = useMemo(
    () =>
      filterEntries({ entries, facets, selected, query }).filter((entry) =>
        matchesAudience(entry, pickedAudiences),
      ),
    [entries, selected, query, pickedAudiences],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <CatalogueSearch
          label="Filter plugins"
          value={query}
          onChange={setQuery}
        />
        <div className="flex flex-wrap items-center gap-2">
          {facetOptions.map((facet) => (
            <FacetMenu
              key={facet.key}
              label={facet.label}
              options={facet.options}
              selected={pickedFor(facet.param)}
              onToggle={(value) => toggle(facet.param, value)}
            />
          ))}
          <ResultCount
            shown={visible.length}
            total={entries.length}
            noun="plugin"
          />
        </div>
      </div>

      <ChipRow
        label="For"
        options={[...audienceOptions]}
        picked={pickedAudiences}
        onToggle={(value) => toggle(AUDIENCE_PARAM, value)}
        setApart={(value) => value === AUDIENCE_ANY}
      />

      {visible.length === 0 ? (
        <NoMatches noun="plugin" />
      ) : (
        <CardGrid
          entries={visible}
          renderCard={(plugin) => (
            <PluginCard
              plugin={plugin}
              skillCount={skillCounts[plugin.id] ?? 0}
            />
          )}
        />
      )}
    </div>
  );
}
