"use client";

import {
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { CollapsibleGrid, PREVIEW } from "@/components/collapsible-grid";
import type { SkillEntry } from "@/lib/catalogue";
import {
  readOpenedSkill,
  skillCardId,
  skillListId,
  subscribeToLocation,
  subscribeToSkillFocus,
} from "@/lib/skill-link";

export function PluginSkills({
  plugin,
  skills,
}: {
  plugin: string;
  skills: SkillEntry[];
}) {
  // Nothing happens on arrival: the strip above already names the skill. Unfolding here would
  // make what you see depend on how you got here.
  const openedFor = useSyncExternalStore(
    subscribeToLocation,
    readOpenedSkill,
    () => "",
  );
  // A new object per press, so a second press for the same skill is not a no-op.
  const [request, setRequest] = useState<{ name: string } | null>(null);
  useEffect(() => subscribeToSkillFocus((name) => setRequest({ name })), []);

  // Activity hides this page rather than unmounting it, so without this the jump outlives the
  // visit and re-fires on return. Layout effect: must run before the page is hidden.
  useLayoutEffect(() => () => setRequest(null), []);

  // Render phase, so the mark and the list never disagree in a committed paint.
  const [seenOpened, setSeenOpened] = useState(openedFor);
  if (seenOpened !== openedFor) {
    setSeenOpened(openedFor);
    setRequest(null);
  }

  const focusedIndex =
    request === null
      ? -1
      : skills.findIndex((skill) => skill.name === request.name);

  useEffect(() => {
    if (request === null) return;
    // Focus as well as scroll: moving the viewport alone leaves a keyboard user behind.
    const card = document.getElementById(skillCardId(plugin, request.name));
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({ block: "center" });
  }, [plugin, request]);

  return (
    <CollapsibleGrid
      id={skillListId(plugin)}
      heading="Skills in this plugin"
      noun="skills"
      forceExpanded={focusedIndex >= PREVIEW}
      // The jump opens the grid from outside its own toggle, so releasing that is what lets the
      // toggle close it again.
      onCollapse={() => setRequest(null)}
      items={skills.map((skill) => {
        // Off the URL, not the jump, so it marks the card however you got to the list.
        const opened = skill.name === openedFor;
        return {
          key: skill.id,
          node: (
            <div
              id={skillCardId(plugin, skill.name)}
              tabIndex={-1}
              aria-current={opened ? "true" : undefined}
              className={`scroll-mt-24 rounded-xl border bg-surface p-4 ${
                opened ? "border-accent" : "border-line"
              }`}
            >
              <span className="font-mono text-sm font-medium text-ink [overflow-wrap:anywhere]">
                <span className="text-accent">/</span>
                {skill.name}
              </span>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-muted">
                {skill.summary ?? skill.description}
              </p>
            </div>
          ),
        };
      })}
    />
  );
}
