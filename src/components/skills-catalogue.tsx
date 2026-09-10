"use client";

import { useMemo } from "react";
import { CatalogueCard } from "@/components/catalogue-card";
import {
  CatalogueSearch,
  ChipRow,
  ResultCount,
} from "@/components/catalogue-controls";
import { CatalogueResults } from "@/components/catalogue-results";
import { FacetMenu } from "@/components/facet-menu";
import {
  AUDIENCE_ANY,
  AUDIENCE_PARAM,
  AUDIENCES,
} from "@/data/skill-audiences";
import { CATEGORIES, CATEGORY_NOTES } from "@/data/skill-categories";
import {
  facetValues,
  shortAgents,
  skillFacets,
  type SkillEntry,
} from "@/lib/catalogue-entries";
import { filterEntries, matchesAudience } from "@/lib/filter";
import { skillLink } from "@/lib/skill-link";
import { useCatalogueFilters } from "@/lib/use-catalogue-filters";

// The URL key for each facet. Written out rather than derived: `agents` is the one field whose
// name is plural, and a param a reader might type or edit should be singular.
const PARAMS: Record<string, string> = {
  agents: "agent",
  plugin: "plugin",
  origin: "origin",
};

// Category and origin are facets, not card text: after filtering they read the same on every card.
function SkillCard({ skill }: { skill: SkillEntry }) {
  const agents = shortAgents(skill.agents);

  return (
    <CatalogueCard
      href={skillLink(skill.plugin, skill.name)}
      name={
        <span className="font-mono text-[0.9375rem] leading-snug font-medium text-ink [overflow-wrap:anywhere]">
          <span className="text-accent">/</span>
          {skill.name}
        </span>
      }
      /* Kept off the footer, which is already the agents and the plugin, and off the summary,
         which is the skill's own words. A reader scanning a heading for work to hand over needs
         to see at a glance that this row configures the toolchain instead.

         "tooling", not "toolchain": at 390px the longer word costs enough width to wrap
         /setup-matt-pocock-skills onto a second line, which pushes the clamped summary past the
         card's fixed height and shears the last line. */
      aside={
        skill.kind !== "skill" ? (
          <span className="shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[0.625rem] text-ink-faint">
            tooling
          </span>
        ) : undefined
      }
      summary={skill.summary ?? skill.description}
      /* Claude Code is on every skill, so it says nothing alone: the signal is whether codex
         sits beside it. */
      footerLeft={<span className="shrink-0">{agents.join(" · ")}</span>}
      footerRight={
        <span className="truncate transition-colors group-hover:text-accent">
          {skill.plugin}
        </span>
      }
    />
  );
}

export function SkillsCatalogue({
  entries,
  initial = {},
  sync = true,
}: {
  entries: SkillEntry[];
  /** Selections off the query string, keyed by URL param. Validated against the real values. */
  initial?: Record<string, string[]>;
  sync?: boolean;
}) {
  const facetOptions = useMemo(
    () =>
      skillFacets.map((facet) => {
        const counts = new Map<string, number>();
        for (const entry of entries) {
          for (const value of facetValues(entry, facet.key)) {
            counts.set(value, (counts.get(value) ?? 0) + 1);
          }
        }
        return {
          ...facet,
          param: PARAMS[facet.key],
          // Counts are deliberately unconditioned: one that collapsed as you filtered could not
          // tell you what is available to filter back to.
          options: [...counts].sort((a, b) => a[0].localeCompare(b[0])),
        };
      }),
    [entries],
  );

  // Audience is the one axis kept in the open, and the only one that is not a facet of the
  // generated index. It names the reader rather than the work, so it is the filter someone
  // arrives already knowing their answer to, the way the language a repo is written in is on
  // /tools. Agent moved into a menu beside the rest: Claude Code covers every skill, so it
  // separates almost nothing.
  //
  // Derived from the rows on screen rather than from AUDIENCES, so an audience nothing is tagged
  // with never draws a chip that can only ever empty the grid. Kept in declared order, which puts
  // "All" last where the row wants it.
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

  const { query, setQuery, picked, pickedFor, toggle } = useCatalogueFilters({
    axes,
    initial,
    sync,
  });

  const pickedAudiences = pickedFor(AUDIENCE_PARAM);

  // Keyed by facet key rather than by param, which is what the shared rule matches on.
  const selected = useMemo(
    () =>
      Object.fromEntries(
        skillFacets.map((facet) => [
          facet.key,
          picked[PARAMS[facet.key]] ?? [],
        ]),
      ),
    [picked],
  );

  const visible = useMemo(
    () =>
      filterEntries({
        entries,
        facets: skillFacets,
        selected,
        query,
      }).filter((entry) => matchesAudience(entry, pickedAudiences)),
    [entries, selected, query, pickedAudiences],
  );

  const sections = CATEGORIES.map((category) => ({
    label: category,
    note: CATEGORY_NOTES[category],
    // Setup and meta rows sort to the foot of their heading. They belong to it -- writing-skills
    // really is Make -- but they are about the toolchain rather than the work, and a reader
    // scanning the first heading for something to reach for should not meet them first.
    entries: visible
      .filter((entry) => entry.category === category)
      .sort((a, b) => Number(a.kind !== "skill") - Number(b.kind !== "skill")),
  })).filter((section) => section.entries.length > 0);

  // Counted from what the sections actually render, so the number can never include a skill that
  // sits in none of the five.
  const onScreen = sections.reduce(
    (sum, section) => sum + section.entries.length,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <CatalogueSearch
          label="What are you trying to do?"
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
          <ResultCount shown={onScreen} total={entries.length} noun="skill" />
        </div>
      </div>

      <ChipRow
        label="For"
        options={[...audienceOptions]}
        picked={pickedAudiences}
        onToggle={(value) => toggle(AUDIENCE_PARAM, value)}
        // Pulled to the end and marked, the way `any` is on the language row: a reader
        // scanning three teams needs to see that the fourth chip is not one.
        setApart={(value) => value === AUDIENCE_ANY}
      />

      <CatalogueResults
        sections={sections}
        // Always grouped, unlike /tools. Audience cuts across all five headings, so a reader who
        // picks Sales is better served seeing which kinds of work their eleven rows land in than
        // seeing them in one undifferentiated grid.
        layout="sections"
        noun="skill"
        renderCard={(skill) => <SkillCard skill={skill} />}
      />
    </div>
  );
}
