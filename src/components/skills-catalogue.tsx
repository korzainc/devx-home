"use client";

import { useMemo, useState } from "react";
import { CatalogueCard } from "@/components/catalogue-card";
import {
  CatalogueSearch,
  ChipRow,
  ResultCount,
} from "@/components/catalogue-controls";
import { CardGrid, CatalogueResults } from "@/components/catalogue-results";
import { FacetMenu } from "@/components/facet-menu";
import {
  AUDIENCE_ANY,
  AUDIENCE_PARAM,
  AUDIENCES,
} from "@/data/skill-audiences";
import {
  CATEGORIES,
  facetValues,
  shortAgents,
  skillFacets,
  type SkillEntry,
} from "@/lib/catalogue-entries";
import { filterEntries, matchesAudience } from "@/lib/filter";
import { terms } from "@/lib/search";
import { skillLink } from "@/lib/skill-link";
import { useCatalogueFilters } from "@/lib/use-catalogue-filters";

// One line per category, in CATEGORIES order, which runs the way the work runs rather than by
// count. Each is written from the skills the category really holds, not from its own name, and all
// six are verb-first so they read as one set.
const NOTES: Record<string, string> = {
  Discover: "Reads up on an unfamiliar domain or codebase",
  Decide: "Explores options and pressure-tests a design before you build it",
  Build: "Writes, fixes and refactors code, and drives the agents that do it",
  Document: "Turns the work into specs, plans and handover notes",
  Verify: "Reviews the code and checks the work is really finished",
  Coordinate: "Files tickets, triages the queue and lands the branch",
};

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
  toolchain = [],
  initial = {},
  sync = true,
}: {
  entries: SkillEntry[];
  /** Setup and meta skills: listed, searchable, never faceted. */
  toolchain?: SkillEntry[];
  /** Selections off the query string, keyed by URL param. Validated against the real values. */
  initial?: Record<string, string[]>;
  sync?: boolean;
}) {
  // null follows the search; a click pins it. One value, so the chevron, the rows and the count
  // cannot disagree.
  const [pinned, setPinned] = useState<boolean | null>(null);

  // Everything below counts, filters and renders from this. A skill whose category no section
  // claims can never reach the grid, so counting it would give a facet a number that picking only
  // ever turns into "No skill matches those filters".
  const shown = useMemo(
    () =>
      entries.filter((entry) =>
        (CATEGORIES as readonly string[]).includes(entry.category),
      ),
    [entries],
  );

  const facetOptions = useMemo(
    () =>
      skillFacets.map((facet) => {
        const counts = new Map<string, number>();
        for (const entry of shown) {
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
    [shown],
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
    const present = new Set(shown.flatMap((entry) => entry.audiences));
    return AUDIENCES.filter((value) => present.has(value));
  }, [shown]);

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

  const { query, setQuery, picked, pickedFor, toggle, filtering } =
    useCatalogueFilters({ axes, initial, sync });

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
        entries: shown,
        facets: skillFacets,
        selected,
        query,
      }).filter((entry) => matchesAudience(entry, pickedAudiences)),
    [shown, selected, query, pickedAudiences],
  );

  // Query only: these rows sit outside every facet.
  const visibleToolchain = useMemo(
    () =>
      filterEntries({ entries: toolchain, facets: [], selected: {}, query }),
    [toolchain, query],
  );

  const sections = CATEGORIES.map((category) => ({
    label: category,
    note: NOTES[category],
    entries: visible.filter((entry) => entry.category === category),
  })).filter((section) => section.entries.length > 0);

  const searching = terms(query).length > 0;
  const facetsActive =
    pickedAudiences.length > 0 ||
    Object.values(selected).some((values) => values.length > 0);
  // A search reveals these rows; a facet cannot, since they sit outside every facet.
  const toolchainShown = pinned ?? (searching && !facetsActive);
  // Rows the results below must not call absent: either they are on screen, or the search reaches
  // them and only a collapsed section is hiding them. Collapsing a match does not unmatch it.
  const outsideMatches =
    toolchainShown || (searching && !facetsActive)
      ? visibleToolchain.length
      : 0;

  // Counted from what the sections actually render, so the number can never include a skill that
  // sits in none of the six, and never promises a toolchain row that is collapsed out of sight.
  const inSections = sections.reduce(
    (sum, section) => sum + section.entries.length,
    0,
  );
  const onScreen = inSections + (toolchainShown ? visibleToolchain.length : 0);

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
          <ResultCount
            shown={onScreen}
            total={shown.length + toolchain.length}
            noun="skill"
          />
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
        filtering={filtering}
        noun="skill"
        outsideMatches={outsideMatches}
        renderCard={(skill) => <SkillCard skill={skill} />}
      />

      {visibleToolchain.length > 0 && (
        <section className="flex flex-col gap-4">
          {/* Open, these nine push the classified rows off the first screen. */}
          <button
            type="button"
            aria-expanded={toolchainShown}
            onClick={() => setPinned(!toolchainShown)}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-line px-4 py-3 text-left transition-colors hover:border-line-strong"
          >
            <span className="text-sm font-medium text-ink">
              Setup and toolchain
            </span>
            <span className="font-mono text-xs text-ink-faint">
              {visibleToolchain.length}
            </span>
            <span className="text-xs text-ink-faint">
              These configure a plugin or describe the toolchain itself; the
              filters above do not apply, though search still finds them.
            </span>
            <span aria-hidden className="ml-auto text-xs text-ink-faint">
              {toolchainShown ? "▾" : "▸"}
            </span>
          </button>

          {toolchainShown && (
            <CardGrid
              entries={visibleToolchain}
              renderCard={(skill) => <SkillCard skill={skill} />}
            />
          )}
        </section>
      )}
    </div>
  );
}
