"use client";

import { useSyncExternalStore } from "react";
import type { SkillEntry } from "@/lib/catalogue";
import {
  focusSkill,
  readOpenedSkill,
  SKILL_LIST_ID,
  subscribeToLocation,
} from "@/lib/skill-link";

/**
 * Names the skill you clicked to get here. The plugin page is otherwise identical however you
 * arrived, so without this the list below is 25 cards and no indication which one you asked for.
 * The matching card carries the mark; this carries the name, the position and the way in.
 */
export function SkillContextStrip({ skills }: { skills: SkillEntry[] }) {
  // The server snapshot is empty so the prerendered markup and the first client render agree,
  // and the strip appears on hydration. Reading `searchParams` on the server instead would make
  // this route dynamic or need a Suspense boundary, which is a bigger change than it looks.
  const openedFor = useSyncExternalStore(
    subscribeToLocation,
    readOpenedSkill,
    () => "",
  );

  if (!openedFor) return null;

  const index = skills.findIndex((skill) => skill.name === openedFor);
  const skill = index === -1 ? undefined : skills[index];

  return (
    <aside
      aria-label="The skill this page was opened for"
      className="flex flex-col gap-1 rounded-xl border border-accent bg-accent-wash px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
    >
      <div className="flex flex-col gap-1">
        <span className="text-[0.65rem] tracking-wide text-ink-faint uppercase">
          Opened for
        </span>
        <span className="font-mono text-sm font-medium text-ink [overflow-wrap:anywhere]">
          <span className="text-accent">/</span>
          {openedFor}
        </span>
        {skill ? (
          // Clamped because this falls back to upstream's own SKILL.md prose, which runs to
          // ~890 characters in the current index. Unclamped that made the strip 511px tall on
          // a 390px-wide phone, pushing the install panel off the first screen. Every row has
          // a summary today, so the fallback only fires when CI picks up a new upstream skill
          // before the Korza overlay catches up.
          <p className="line-clamp-2 text-[0.8125rem] leading-relaxed text-ink-muted">
            {skill.summary ?? skill.description}
          </p>
        ) : (
          // Names no cause. It reads as "renamed upstream" but the same branch catches a
          // skill that is merely unreleased: the six `Planned` rows are filtered out of the
          // index, so /skills/codezen?skill=design-doc lands here while that skill is neither
          // renamed nor gone.
          //
          // A whole sentence, not a predicate: the name above it is a separate element, so a
          // fragment here reads as "is not in this plugin" on its own to a screen reader.
          <p className="text-[0.8125rem] leading-relaxed text-ink-muted">
            This skill is not in the plugin&apos;s current index.
          </p>
        )}
      </div>

      {skill && (
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <span className="font-mono text-xs whitespace-nowrap text-ink-faint">
            {index + 1} of {skills.length} in this plugin
          </span>
          <button
            type="button"
            aria-controls={SKILL_LIST_ID}
            onClick={() => focusSkill(skill.name)}
            className="font-mono text-xs whitespace-nowrap text-accent hover:underline"
          >
            Show in list ↓
          </button>
        </div>
      )}
    </aside>
  );
}
