"use client";

import Link from "next/link";
import { useState } from "react";
import { AUDIENCE_ANY, type Audience } from "@/data/skill-audiences";

/** Only the fields the cards draw. A `SkillEntry` also carries `ref`, the git ref the skill is
 *  pinned to, and spreading that into a component hands React a real ref. */
export type SkillCard = {
  id: string;
  title: string;
  summary: string;
  audiences: Audience[];
  provenance: string;
};

/** Not an audience, the absence of a filter. Named here rather than in the audience data because
 *  it exists only as a control. */
const EVERYONE = "Everyone";

const CHIPS = [EVERYONE, "Engineering", "Business", "Sales"] as const;

/** A landing panel, not the marketplace: the row is a taste of what is in there, and the grid is
 *  built around six cells. */
const SHOWN = 5;

/**
 * Picking an audience unions in the All-tagged skills, the way picking a language on /tools unions
 * in the language-agnostic ones. An All skill is one whose subject is the thinking or the writing
 * rather than the code, so it is nobody's speciality and therefore everybody's.
 *
 * Sorted so the skills that actually carry the audience come first. Sales has exactly one skill of
 * its own in the whole marketplace, and without this it would be pushed off the end of the five by
 * the All rows and the chip would show nothing specific to Sales at all.
 */
function forChip(cards: SkillCard[], chip: string): SkillCard[] {
  if (chip === EVERYONE) return cards.slice(0, SHOWN);
  return cards
    .filter(
      (card) =>
        card.audiences.includes(chip as Audience) ||
        card.audiences.includes(AUDIENCE_ANY),
    )
    .sort(
      (a, b) =>
        Number(b.audiences.includes(chip as Audience)) -
        Number(a.audiences.includes(chip as Audience)),
    )
    .slice(0, SHOWN);
}

export function SkillPicker({ cards }: { cards: SkillCard[] }) {
  const [active, setActive] = useState<string>(EVERYONE);
  const shown = forChip(cards, active);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            aria-pressed={chip === active}
            onClick={() => setActive(chip)}
            className={
              chip === active
                ? "rounded-full border border-ink-muted px-4 py-1.5 text-sm font-medium text-ink"
                : "rounded-full border border-line-strong px-4 py-1.5 text-sm text-ink-muted transition-colors hover:border-ink-faint hover:text-ink"
            }
          >
            {chip}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((card, i) => (
          <div
            key={card.id}
            /* A fixed height rather than a minimum, with the text clamped to fit it: a card that
               grew with its summary would make a wordy skill look more important than a terse
               one, which is the wrong ranking to draw. */
            className="deal flex h-56 flex-col gap-2 overflow-hidden rounded-2xl bg-surface p-5 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--ink)_10%,transparent),0_12px_32px_-14px_rgb(0_0_0/0.8)]"
            /* Shifts each card's slice of the range so they arrive in sequence. A delay would not
               do it: on a scroll timeline the delay is a length along the range, not a wait. */
            style={{ animationRange: `cover ${i * 3}% cover ${26 + i * 3}%` }}
          >
            <p className="font-mono text-xs tracking-wide text-accent uppercase">
              {card.audiences.join(", ")}
            </p>
            <h3 className="line-clamp-2 font-display text-lg leading-snug font-semibold tracking-tight text-ink">
              {card.title}
            </h3>
            <p className="line-clamp-3 text-sm leading-relaxed text-ink-muted">
              {card.summary}
            </p>
            <p className="mt-auto pt-3 font-mono text-xs text-ink-faint">
              {card.provenance}
            </p>
          </div>
        ))}

        {/* A grid item so the last row stays even, but with nothing drawn behind it: the cell is
            the gap the cards leave, and the link sits in it. Drawn as a card it would read as a
            sixth skill. */}
        <div
          className="deal deal-flat flex items-center justify-center p-5"
          /* Carries on the cards' stagger. Without a range of its own it would take the default,
             which spans the whole traversal, and the link would still be arriving long after the
             last card had settled. */
          style={{
            animationRange: `cover ${shown.length * 3}% cover ${26 + shown.length * 3}%`,
          }}
        >
          <Link
            href="/skills"
            className="font-display text-lg font-semibold tracking-tight text-accent transition-colors hover:text-ink"
          >
            Browse the marketplace →
          </Link>
        </div>
      </div>
    </div>
  );
}
