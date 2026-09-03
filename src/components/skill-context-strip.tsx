"use client";

import { useSyncExternalStore } from "react";
import type { SkillEntry } from "@/lib/catalogue";
import {
  focusSkill,
  readOpenedSkill,
  skillListId,
  subscribeToLocation,
} from "@/lib/skill-link";

/** Names the skill you clicked to get here; the matching card carries the mark. */
export function SkillContextStrip({
  plugin,
  skills,
}: {
  plugin: string;
  skills: SkillEntry[];
}) {
  // Empty server snapshot, so the strip appears on hydration. Reading `searchParams` on the
  // server instead costs the static route.
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
        <span className="text-[0.65rem] tracking-wide text-ink-muted uppercase">
          Opened for
        </span>
        {/* Clamped, not truncated at the source: the lookup above needs the whole value. */}
        <span className="line-clamp-2 font-mono text-sm font-medium text-ink [overflow-wrap:anywhere]">
          <span className="text-accent-strong">/</span>
          {openedFor}
        </span>
        {skill ? (
          // Clamped: the fallback is upstream SKILL.md prose, ~890 chars at its longest.
          <p className="line-clamp-2 text-[0.8125rem] leading-relaxed text-ink-muted">
            {skill.summary ?? skill.description}
          </p>
        ) : (
          // Names no cause: this also catches the `Planned` rows, which are filtered out of
          // the index and neither renamed nor gone. A whole sentence, because the name above
          // is a separate element.
          <p className="text-[0.8125rem] leading-relaxed text-ink-muted">
            This skill is not in the plugin&apos;s current index.
          </p>
        )}
      </div>

      {skill && (
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <span className="font-mono text-xs whitespace-nowrap text-ink-muted">
            {index + 1} of {skills.length} in this plugin
          </span>
          <button
            type="button"
            aria-controls={skillListId(plugin)}
            onClick={() => focusSkill(skill.name)}
            className="font-mono text-xs whitespace-nowrap text-accent-strong hover:underline"
          >
            Show in list
            <span aria-hidden className="ml-1">
              ↓
            </span>
          </button>
        </div>
      )}
    </aside>
  );
}
