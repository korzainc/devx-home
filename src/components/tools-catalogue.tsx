"use client";

import { useMemo, type ReactNode } from "react";
import { CatalogueCard } from "@/components/catalogue-card";
import {
  CatalogueSearch,
  ChipRow,
  ResultCount,
} from "@/components/catalogue-controls";
import { CatalogueResults } from "@/components/catalogue-results";
import { FacetMenu } from "@/components/facet-menu";
import {
  facetValues,
  type Facet,
  type PublicBundleEntry,
  type PublicToolEntry,
} from "@/lib/catalogue-entries";
import { filterEntries } from "@/lib/filter";
import { useCatalogueFilters } from "@/lib/use-catalogue-filters";

// Fixed order: the two sections an engineer touches on every PR come first. Never derived,
// sorted, or reordered by count. `category` matches `ToolEntry.category`'s real value, and
// `label`/`note` are display-only, so neither can perturb the taxonomy.
// Each note names checks the section's tools really declare, and all four are verb-first so they
// read as one set.
const SECTIONS: { label: string; category: string; note: string }[] = [
  {
    label: "Code Quality",
    category: "Code Quality",
    note: "Lints style, formatting, types and bug patterns",
  },
  {
    label: "Testing",
    category: "Testing",
    note: "Runs unit and end-to-end tests, and measures coverage",
  },
  {
    label: "Security",
    category: "Security",
    note: "Scans source and git history for vulnerabilities and secrets",
  },
  {
    // Names vulnerabilities even though neither tool here declares `sca`: the taxonomy files that
    // capability under security, but Dependabot reads the dependency graph against GitHub's
    // advisory database, so this section really is where a vulnerable package surfaces and gets
    // fixed. Don't "correct" this against the capability list.
    label: "Dependencies",
    category: "Dependencies",
    note: "Flags outdated and vulnerable packages, and opens the pull request",
  },
];

// The facet is keyed by `capabilities` but reads "Check": the page's own lede already calls these
// "what a tool does", and "Capability" is the one word on screen that nothing else on the site
// uses.
const facets: Facet<PublicToolEntry>[] = [
  { key: "capabilities", label: "Check" },
];

// The 14 upstream capabilities are a taxonomy, not a filter row: picking between "Style Linting"
// and "Formatting" asks the reader to know which tool upstream filed where. These 7 group them
// into the questions someone actually arrives with. `check-groups.test.ts` fails if a resync adds
// a capability none of them claims, so the filter can't silently stop reaching a tool.
// `iac-dockerfile-lint` sits here only under Infrastructure: it is legal to list it under Code
// Linting too, but that pulls the Docker bundle in beside Prettier and TypeScript.
export const CHECK_GROUPS: {
  id: string;
  label: string;
  capabilities: string[];
}[] = [
  {
    id: "linting",
    label: "Code Linting",
    capabilities: ["lint-style", "format", "lint-bugs", "typecheck"],
  },
  {
    id: "testing",
    label: "Testing and Code Coverage",
    capabilities: ["unit-tests", "coverage", "e2e-tests"],
  },
  { id: "sast", label: "Code Security (SAST)", capabilities: ["sast"] },
  { id: "secrets", label: "Secret Scanning", capabilities: ["secrets"] },
  {
    id: "dependencies",
    label: "Dependencies",
    capabilities: ["dependency-updates", "sca"],
  },
  {
    id: "containers",
    label: "Container Scanning",
    capabilities: ["image-scan"],
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    capabilities: ["iac-config", "iac-dockerfile-lint"],
  },
];

/** Each language spelled the way its own docs spell it, and `any` named for what it means to a
 *  reader picking a filter. An id with no entry falls back to itself, so a language the taxonomy
 *  adds later still gets a chip. */
const STACK_LABELS: Record<string, string> = {
  go: "Go",
  java: "Java",
  javascript: "JavaScript",
  python: "Python",
  typescript: "TypeScript",
  any: "Language-agnostic",
};

const ANY = "any";

function stackLabel(value: string): string {
  return STACK_LABELS[value] ?? value;
}

function ToolCard({
  tool,
  labels,
}: {
  tool: PublicToolEntry | PublicBundleEntry;
  labels: Record<string, string>;
}) {
  return (
    <CatalogueCard
      href={`/tools/${tool.id}`}
      name={
        <h3 className="truncate font-mono text-lg leading-snug font-medium text-ink group-hover:text-accent">
          {tool.name}
        </h3>
      }
      summary={tool.cardSummary}
      footerLeft={
        <span className="truncate">
          {tool.capabilities
            .map((capability) => labels[capability] ?? capability)
            .join(" · ")}
        </span>
      }
    />
  );
}

export function ToolsCatalogue({
  entries,
  capabilityLabels = {},
  initialStacks = [],
  initialChecks = [],
}: {
  entries: (PublicToolEntry | PublicBundleEntry)[];
  /** Handed down from the server: `@/lib/catalogue` is server-only, so this cannot be looked up
   *  here. An id with no entry falls back to showing itself. */
  capabilityLabels?: Record<string, string>;
  initialStacks?: string[];
  initialChecks?: string[];
}): ReactNode {
  // Everything below counts, filters and renders from this rather than from `entries`. A tool
  // whose category no section claims (a resynced taxonomy adding one, or `realCategory` falling
  // through to "Other") can never reach the grid, so counting it would give the Check row a
  // number that picking only ever turns into "No tool matches those filters".
  const shown = useMemo(
    () =>
      entries.filter((entry) =>
        SECTIONS.some((section) => section.category === entry.category),
      ),
    [entries],
  );

  // Derived from the visible entries at render time, never hardcoded, so a language with zero
  // tools behind it never appears as a chip. `any` is pulled to the end: it names a kind of repo,
  // not a language, and alphabetical order would otherwise open the row with it.
  const stackOptions = useMemo(() => {
    const all = [...new Set(shown.flatMap((entry) => entry.stacks))];
    const languages = all
      .filter((value) => value !== ANY)
      .sort((a, b) => stackLabel(a).localeCompare(stackLabel(b)));
    return all.includes(ANY) ? [...languages, ANY] : languages;
  }, [shown]);

  const axes = useMemo(
    () => [
      { param: "stack", valid: stackOptions },
      { param: "check", valid: CHECK_GROUPS.map((group) => group.id) },
    ],
    [stackOptions],
  );

  const { query, setQuery, pickedFor, toggle, filtering } = useCatalogueFilters(
    { axes, initial: { stack: initialStacks, check: initialChecks } },
  );
  const pickedStacks = pickedFor("stack");
  const pickedChecks = pickedFor("check");

  // A tool with two capabilities in one group counts once, so the number beside a group is the
  // number of cards picking it produces. Left in CHECK_GROUPS order rather than sorted: the row
  // runs write-time checks first, then security, then the slower supply-chain ones.
  const checkOptions = useMemo(
    (): [string, number][] =>
      CHECK_GROUPS.map((group) => [
        group.id,
        shown.filter((entry) =>
          facetValues(entry, "capabilities").some((value) =>
            group.capabilities.includes(value),
          ),
        ).length,
      ]),
    [shown],
  );

  const visible = useMemo(() => {
    // Groups are expanded to the capability ids behind them and handed to the shared rule, so
    // grouping stays a presentation choice and the match itself is still the one in
    // `filterEntries`.
    const wanted = CHECK_GROUPS.filter((group) =>
      pickedChecks.includes(group.id),
    ).flatMap((group) => group.capabilities);
    const byCapAndQuery = filterEntries({
      entries: shown,
      facets,
      selected: { capabilities: wanted },
      query,
    });
    // Stack is a union, not an intersection, and is handled here rather than through
    // filterEntries's generic facet path because of it: 3 of the 5 universal tools carry a
    // `required: true` capability in the docker, go, java, javascript and python baselines, so
    // exact-matching would drop mandatory checks out of a stack-filtered view. The one baseline
    // that would survive it is typescript, which pins only `typecheck`.
    // One `.filter` over one list, so a tool that matches two of the picked languages is still
    // returned once.
    return byCapAndQuery.filter(
      (entry) =>
        pickedStacks.length === 0 ||
        entry.stacks.some((stack) => pickedStacks.includes(stack)) ||
        entry.stacks.includes(ANY),
    );
  }, [shown, pickedChecks, query, pickedStacks]);

  const sections = SECTIONS.map((section) => ({
    label: section.label,
    note: section.note,
    entries: visible.filter((entry) => entry.category === section.category),
  })).filter((section) => section.entries.length > 0);

  // Both halves of the announcement come from the same pool, so "n of N" cannot name a total the
  // page has no way to reach. Counted from what the sections actually render, not from `visible`,
  // so the number can never include a tool that sits in none of the four.
  const onScreen = sections.reduce(
    (sum, section) => sum + section.entries.length,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <CatalogueSearch
          label="Filter tools"
          value={query}
          onChange={setQuery}
        />
        <div className="flex flex-wrap items-center gap-2">
          <FacetMenu
            label="Check"
            options={checkOptions}
            selected={pickedChecks}
            onToggle={(value) => toggle("check", value)}
            labelFor={(value) =>
              CHECK_GROUPS.find((group) => group.id === value)?.label ?? value
            }
          />
          <ResultCount shown={onScreen} total={shown.length} noun="tool" />
        </div>
      </div>

      <ChipRow
        label="Applies to"
        options={stackOptions}
        picked={pickedStacks}
        onToggle={(value) => toggle("stack", value)}
        labelFor={stackLabel}
        // `any` sits in the same row and toggles the same way, but a reader scanning five
        // language names needs to see that the sixth is not one.
        setApart={(value) => value === ANY}
      />

      <CatalogueResults
        sections={sections}
        filtering={filtering}
        noun="tool"
        renderCard={(tool) => (
          <ToolCard tool={tool} labels={capabilityLabels} />
        )}
      />
    </div>
  );
}
