"use client";

import { useSyncExternalStore } from "react";
import type { SkillEntry } from "@/lib/catalogue";
import {
  focusSkill,
  readHash,
  SKILL_LIST_ID,
  subscribeToHash,
} from "@/lib/skill-link";

/**
 * Names the skill you clicked to get here. The plugin page is otherwise identical however you
 * arrived, so without this the list below is 25 cards and no indication which one you asked for.
 */
export function SkillContextStrip({ skills }: { skills: SkillEntry[] }) {
  // The server snapshot is empty because the fragment is never sent to the server, so the
  // prerendered markup and the first client render agree and the strip appears on hydration.
  // Nothing on this page rewrites the fragment, so this stays put for the whole visit — see
  // the collapse case in skill-jump.test.tsx, which is what would break if that changed.
  const openedFor = useSyncExternalStore(subscribeToHash, readHash, () => "");

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
          <p className="text-[0.8125rem] leading-relaxed text-ink-muted">
            {skill.summary ?? skill.description}
          </p>
        ) : (
          // Skill names come from the generated index, so an upstream rename changes the
          // fragment. Saying so beats rendering nothing, which reads as arriving with no link.
          <p className="text-[0.8125rem] leading-relaxed text-ink-muted">
            is no longer in this plugin — it may have been renamed upstream.
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
