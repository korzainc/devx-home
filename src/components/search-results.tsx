import Link from "next/link";
import type { SearchKind } from "@/lib/search/corpus";

/**
 * One group of results, and the rows inside it.
 *
 * Skills and tools answer different questions - what an agent should do, and what a pipeline
 * should run - so they are grouped under labelled headings rather than interleaved. A skill row is
 * monospace behind an accent `/`, matching SkillCard; a tool row is body text with its capability.
 * The two read apart in greyscale, so the distinction never rests on colour.
 */

export type SearchHit = {
  key: string;
  kind: SearchKind;
  name: string;
  blurb: string;
  href: string;
  context: string;
};

const GROUPS: { kind: SearchKind; label: string }[] = [
  { kind: "skill", label: "Skills" },
  { kind: "tool", label: "CI tools" },
  { kind: "plugin", label: "Plugins" },
];

export function SearchResultRow({
  hit,
  active,
  id,
  onHover,
}: {
  hit: SearchHit;
  active: boolean;
  id: string;
  onHover?: () => void;
}) {
  return (
    <Link
      id={id}
      role="option"
      aria-selected={active}
      href={hit.href}
      onMouseEnter={onHover}
      // Keyboard selection is tracked in state, so the highlight is a class rather than :hover:
      // a mouse sitting still while the user arrows down must not paint a second active row.
      className={`flex items-baseline justify-between gap-4 px-4 py-3 no-underline transition-colors ${
        active ? "bg-accent-wash" : "hover:bg-surface"
      }`}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        {/* A skill or tool name is an identifier the user types verbatim, so auto-translation
            must leave it alone. */}
        <span
          translate="no"
          className={
            hit.kind === "skill"
              ? "font-mono text-sm font-medium text-ink [overflow-wrap:anywhere]"
              : "text-sm font-medium text-ink"
          }
        >
          {hit.kind === "skill" && <span className="text-accent">/</span>}
          {hit.name}
        </span>
        {hit.blurb && (
          <span className="truncate text-xs leading-relaxed text-ink-muted">
            {hit.blurb}
          </span>
        )}
      </span>
      <span className="shrink-0 font-mono text-[0.65rem] text-ink-faint">
        {hit.context}
      </span>
    </Link>
  );
}

/** Rows in corpus-group order, with the group that holds the best hit first. */
export function groupHits(
  hits: SearchHit[],
): { label: string; hits: SearchHit[] }[] {
  return (
    GROUPS.map(({ kind, label }) => ({
      label,
      hits: hits.filter((hit) => hit.kind === kind),
    }))
      .filter((group) => group.hits.length > 0)
      // Whichever group owns the top-ranked hit leads, so the best answer is never below a heading
      // the user has to scan past.
      .sort((a, b) => hits.indexOf(a.hits[0]) - hits.indexOf(b.hits[0]))
  );
}

export function SearchGroupHeading({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <div
      role="presentation"
      className="flex items-baseline justify-between gap-3 border-b border-line px-4 pt-3 pb-1.5"
    >
      <span className="font-mono text-[0.65rem] tracking-wider text-ink-faint uppercase">
        {label}
      </span>
      <span className="font-mono text-[0.65rem] text-ink-faint tabular-nums">
        {count}
      </span>
    </div>
  );
}
