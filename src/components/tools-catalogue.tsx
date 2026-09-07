"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
const facets: Facet<PublicToolEntry>[] = [
  { key: "capabilities", label: "Capability" },
];

function ToolCard({ tool }: { tool: PublicToolEntry | PublicBundleEntry }) {
  return (
    <Link
      href={`/tools/${tool.id}`}
      className="group flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-surface-raised"
    >
      <h3 className="font-medium text-ink group-hover:text-accent">
        {tool.name}
      </h3>

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
  initialStacks = [],
  initialCapabilities = [],
}: {
  entries: (PublicToolEntry | PublicBundleEntry)[];
  initialStacks?: string[];
  initialCapabilities?: string[];
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
  const [pickedCaps, setPickedCaps] = useState(initialCapabilities);

  const router = useRouter();
  const pathname = usePathname();
  // Skip the first run: the URL already matches initialStacks/initialCapabilities (that's where
  // they came from), so replacing on mount would be a same-value no-op navigation for no reason.
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    // Built by hand rather than via URLSearchParams: stack and capability values are known-safe
    // slug characters that need no escaping, and URLSearchParams would percent-encode the comma
    // separator, so the address bar would show %2C instead of a plain, readable list.
    const parts: string[] = [];
    if (pickedStacks.length) parts.push(`stack=${pickedStacks.join(",")}`);
    if (pickedCaps.length) parts.push(`cap=${pickedCaps.join(",")}`);
    const query = parts.join("&");
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }, [pickedStacks, pickedCaps, pathname, router]);

  const capOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      for (const value of facetValues(entry, "capabilities")) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
  }, [entries]);

  // Derived from the visible entries at render time, never hardcoded, so a stack with zero
  // tools behind it (docker today) never appears as a chip.
  const stackOptions = useMemo(
    () => [...new Set(entries.flatMap((entry) => entry.stacks))].sort(),
    [entries],
  );

  const visible = useMemo(() => {
    const byCapAndQuery = filterEntries({
      entries,
      facets,
      selected: { capabilities: pickedCaps },
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
  }, [entries, pickedCaps, query, pickedStacks]);

  // Every section renders whether or not it matched, so a filtered view keeps the same four
  // headings in the same order and says so per section instead of dropping one silently.
  const bySection = SECTIONS.map((section) => ({
    ...section,
    tools: visible.filter((entry) => entry.category === section.category),
  }));

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

  function toggleCap(value: string) {
    setPickedCaps((previous) =>
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
            label="Capability"
            options={capOptions}
            selected={pickedCaps}
            onToggle={toggleCap}
          />
          {/* The debounced, worded version below carries this for assistive tech, so a screen
              reader doesn't read the count twice. */}
          <span aria-hidden className="ml-1 shrink-0 text-sm text-ink-muted">
            <span className="font-mono text-ink">{onScreen}</span> of{" "}
            <span className="font-mono">{total}</span>
          </span>
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
          Stack
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
                className={
                  on
                    ? "rounded-full border border-line-strong bg-accent-wash px-3 py-1.5 text-sm text-ink transition-colors"
                    : "rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                }
              >
                {value}
              </button>
            );
          })}
        </div>
      </div>

      {onScreen === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-6 py-16 text-center text-sm text-ink-muted">
          No tool matches those filters.
        </p>
      ) : (
        bySection.map((section) => (
          <section key={section.label} className="flex flex-col gap-4">
            <div className="flex items-baseline gap-x-3 border-b border-line pb-2">
              <h2 className="shrink-0 font-display text-xl font-semibold text-ink">
                {section.label}
              </h2>
              {/* Truncates instead of wrapping: the row stays one line and the count stays
                  pinned at the far right regardless of how long a section's note is - Security's
                  is noticeably longer than the other three. */}
              <span
                title={section.note}
                className="min-w-0 flex-1 truncate text-xs text-ink-faint"
              >
                {section.note}
              </span>
              <span className="shrink-0 font-mono text-xs text-ink-faint">
                {section.tools.length}
              </span>
            </div>
            {section.tools.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-6 py-8 text-center text-sm text-ink-muted">
                Nothing in {section.label} matches those filters.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {section.tools.map((tool) => (
                  // Anchor target for gap-analysis links. Resolves in the unfiltered state.
                  <div key={tool.id} id={tool.id} className="scroll-mt-24">
                    <ToolCard tool={tool} />
                  </div>
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}
