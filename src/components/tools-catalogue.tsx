"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { CatalogueCard } from "@/components/catalogue-card";
import { FacetMenu } from "@/components/facet-menu";
import {
  facetValues,
  type Facet,
  type PublicBundleEntry,
  type PublicToolEntry,
} from "@/lib/catalogue-entries";
import { filterEntries } from "@/lib/filter";
import { useSlashShortcut } from "@/lib/slash-shortcut";
import { useDebouncedValue } from "@/lib/use-debounced-value";

// Fixed order: the two sections an engineer touches on every PR come first. Never derived,
// sorted, or reordered by count. `category` matches `ToolEntry.category`'s real value -
// `label`/`note` are display-only, so "Staying Current" never touches the taxonomy itself.
const SECTIONS: { label: string; category: string; note: string }[] = [
  {
    label: "Code Quality",
    category: "Code Quality",
    note: "Catches messy code before your reviewers do",
  },
  {
    label: "Testing",
    category: "Testing",
    note: "Proof that your code works, not just compiles",
  },
  {
    label: "Security",
    category: "Security",
    note: "Catches vulnerabilities and risky configs that shouldn't ship",
  },
  {
    label: "Staying Current",
    category: "Dependencies",
    note: "Keeping dependencies up to date",
  },
];

// Module scope, not inline: `visible`'s useMemo lists this as a dependency, and a
// component-scoped array literal is a new reference every render, defeating that memo silently.
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

function ToolGrid({
  tools,
  labels,
}: {
  tools: (PublicToolEntry | PublicBundleEntry)[];
  labels: Record<string, string>;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {tools.map((tool) => (
        // Anchor target for gap-analysis links. Resolves in the unfiltered state.
        <div key={tool.id} id={tool.id} className="scroll-mt-24">
          <ToolCard tool={tool} labels={labels} />
        </div>
      ))}
    </div>
  );
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
  const [query, setQuery] = useState("");
  // Both panels stay mounted across tests, so a fixed id would give the document two search
  // inputs.
  const searchId = useId();
  const stackLabelId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const { enabled: slashEnabled, toggle: toggleSlashShortcut } =
    useSlashShortcut(searchRef);

  const [pickedStacks, setPickedStacks] = useState(initialStacks);
  const [pickedChecks, setPickedChecks] = useState(initialChecks);

  const router = useRouter();
  const pathname = usePathname();
  // Skip the first run: the URL already matches initialStacks/initialChecks (that's where
  // they came from), so replacing on mount would be a same-value no-op navigation for no reason.
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    // Built by hand rather than via URLSearchParams: stack and check values are known-safe slug
    // characters that need no escaping, and URLSearchParams would percent-encode the comma
    // separator, so the address bar would show %2C instead of a plain, readable list.
    const parts: string[] = [];
    if (pickedStacks.length) parts.push(`stack=${pickedStacks.join(",")}`);
    if (pickedChecks.length) parts.push(`check=${pickedChecks.join(",")}`);
    const query = parts.join("&");
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [pickedStacks, pickedChecks, pathname, router]);

  // A tool with two capabilities in one group counts once, so the number beside a group is the
  // number of cards picking it produces. Left in CHECK_GROUPS order rather than sorted: the row
  // runs write-time checks first, then security, then the slower supply-chain ones.
  const checkOptions = useMemo(
    (): [string, number][] =>
      CHECK_GROUPS.map((group) => [
        group.id,
        entries.filter((entry) =>
          facetValues(entry, "capabilities").some((value) =>
            group.capabilities.includes(value),
          ),
        ).length,
      ]),
    [entries],
  );

  // Derived from the visible entries at render time, never hardcoded, so a language with zero
  // tools behind it never appears as a chip. `any` is pulled to the end: it names a kind of repo,
  // not a language, and alphabetical order would otherwise open the row with it.
  const stackOptions = useMemo(() => {
    const all = [...new Set(entries.flatMap((entry) => entry.stacks))];
    const languages = all
      .filter((value) => value !== ANY)
      .sort((a, b) => stackLabel(a).localeCompare(stackLabel(b)));
    return all.includes(ANY) ? [...languages, ANY] : languages;
  }, [entries]);

  const visible = useMemo(() => {
    // Groups are expanded to the capability ids behind them and handed to the shared rule, so
    // grouping stays a presentation choice and the match itself is still the one in `filterEntries`.
    const wanted = CHECK_GROUPS.filter((group) =>
      pickedChecks.includes(group.id),
    ).flatMap((group) => group.capabilities);
    const byCapAndQuery = filterEntries({
      entries,
      facets,
      selected: { capabilities: wanted },
      query,
    });
    // Stack is handled separately, not through filterEntries's generic facet path, since it
    // needs the "universal tools always shown" exception a plain intersection doesn't have: 3
    // of the 5 universal tools tie to a `required: true` capability in every stack's baseline,
    // so exact-matching would silently drop mandatory checks from a stack-filtered view.
    return byCapAndQuery.filter(
      (entry) =>
        pickedStacks.length === 0 ||
        entry.stacks.some((stack) => pickedStacks.includes(stack)) ||
        entry.stacks.includes("any"),
    );
  }, [entries, pickedChecks, query, pickedStacks]);

  // An empty section is never announced, only dropped. Unfiltered that can only happen if the
  // synced taxonomy stops covering a category, where "nothing matches your filters" would be a
  // lie; filtered, the flat grid below means no section renders at all.
  const bySection = SECTIONS.map((section) => ({
    ...section,
    tools: visible.filter((entry) => entry.category === section.category),
  })).filter((section) => section.tools.length > 0);

  // The dividers are the capability categories (see `realCategory`), so picking a Check narrows
  // to one section and guarantees the other three are empty. Once any filter is on, the grouping
  // repeats what the filter row already says, so the results collapse into a single grid.
  const filtering =
    pickedChecks.length > 0 ||
    pickedStacks.length > 0 ||
    query.trim().length > 0;

  const total = entries.length;
  // Counted from what bySection actually renders, not from `visible` directly, so the
  // on-screen count can never name a tool that isn't in any of the four sections - mirroring
  // the invariant CatalogueGrid states for its own onScreen/couldShow split.
  const onScreen = bySection.reduce(
    (sum, section) => sum + section.tools.length,
    0,
  );
  // The visible count updates every keystroke; the announcement waits for typing to settle, so
  // a screen reader isn't read a new number on every keystroke.
  const announced = useDebouncedValue(`${onScreen} of ${total} tools shown.`);

  function toggleStack(value: string) {
    setPickedStacks((previous) =>
      previous.includes(value)
        ? previous.filter((entry) => entry !== value)
        : [...previous, value],
    );
  }

  function toggleCheck(value: string) {
    setPickedChecks((previous) =>
      previous.includes(value)
        ? previous.filter((entry) => entry !== value)
        : [...previous, value],
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <label htmlFor={searchId} className="sr-only">
            Filter tools
          </label>
          <span
            aria-hidden
            className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-faint"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <circle
                cx="11"
                cy="11"
                r="7"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="m20 20-3.5-3.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <input
            id={searchId}
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              // Clears first; blurring outright would dump focus onto <body>, restarting the
              // next Tab from the top of the document instead of continuing past this field. An
              // already-empty field has nothing left to clear, so Escape falls back to the
              // plain dismiss a user expects instead of doing nothing at all.
              if (query) setQuery("");
              else event.currentTarget.blur();
            }}
            placeholder="Filter tools"
            // A text input matches :focus-visible on every click, not just keyboard nav, so the
            // global accent outline painted here on every click. border-accent keeps a real,
            // AA-contrast focus signal without bringing that ring back.
            className="w-full rounded-lg border border-line bg-surface py-2.5 pr-11 pl-10 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus-visible:outline-none"
          />
          <button
            type="button"
            onClick={toggleSlashShortcut}
            aria-pressed={slashEnabled}
            aria-label={
              slashEnabled
                ? "Keyboard shortcut: press / to jump here. Click to turn it off."
                : "The / keyboard shortcut is off. Click to turn it back on."
            }
            title={
              slashEnabled
                ? "Press / to jump here. Click to turn off."
                : "The / shortcut is off. Click to turn back on."
            }
            className={`absolute top-1/2 right-3 -translate-y-1/2 rounded border border-line px-1.5 py-0.5 font-mono text-[0.65rem] text-ink-faint transition-colors hover:border-line-strong ${slashEnabled ? "" : "line-through"}`}
          >
            /
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FacetMenu
            label="Check"
            options={checkOptions}
            selected={pickedChecks}
            onToggle={toggleCheck}
            labelFor={(value) =>
              CHECK_GROUPS.find((group) => group.id === value)?.label ?? value
            }
          />
          {/* Deliberately has no visible counterpart: a sighted user reads the result count off
              the rows themselves, but a screen reader user has no other way to tell how much the
              filters just removed. */}
          <span role="status" className="sr-only">
            {announced}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span
          id={stackLabelId}
          className="text-xs font-medium tracking-wide text-ink-faint uppercase"
        >
          Applies to
        </span>
        <div
          role="group"
          aria-labelledby={stackLabelId}
          className="flex flex-wrap items-center gap-2"
        >
          {stackOptions.map((value) => {
            const on = pickedStacks.includes(value);
            return (
              <button
                key={value}
                type="button"
                aria-pressed={on}
                onClick={() => toggleStack(value)}
                // Dashed only for `any`: it sits in the same row and toggles the same way, but a
                // reader scanning five language names needs to see that the sixth is not one.
                className={`${value === ANY ? "ml-1 border-dashed" : ""} ${
                  on
                    ? "rounded-full border border-line-strong bg-accent-wash px-3 py-1.5 text-sm text-ink transition-colors"
                    : "rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                }`}
              >
                {stackLabel(value)}
              </button>
            );
          })}
        </div>
      </div>

      {onScreen === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-ink-muted">
          No tool matches those filters.
        </p>
      ) : filtering ? (
        // Flattened from `bySection`, not from `visible`, so the filtered view can never surface
        // a tool the grouped view drops for sitting in no section.
        <ToolGrid
          tools={bySection.flatMap((section) => section.tools)}
          labels={capabilityLabels}
        />
      ) : (
        bySection.map((section) => (
          <section key={section.label} className="flex flex-col gap-4">
            <div className="flex items-baseline gap-x-3 border-b border-line pb-2">
              <h2 className="shrink-0 font-display text-xl font-semibold text-ink">
                {section.label}
              </h2>
              {/* Truncates instead of wrapping, so the heading row stays one line however long a
                  section's note is - Security's is noticeably longer than the other three. */}
              <span
                title={section.note}
                className="min-w-0 flex-1 truncate text-xs text-ink-faint"
              >
                {section.note}
              </span>
            </div>
            <ToolGrid tools={section.tools} labels={capabilityLabels} />
          </section>
        ))
      )}
    </div>
  );
}
