"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CollapsibleGrid, PREVIEW } from "@/components/collapsible-grid";
import type { SkillEntry } from "@/lib/catalogue";
import {
  readOpenedSkill,
  SKILL_LIST_ID,
  subscribeToLocation,
  subscribeToSkillFocus,
} from "@/lib/skill-link";

export function PluginSkills({ skills }: { skills: SkillEntry[] }) {
  // Nothing happens on arrival: the context strip above already names the skill you came for,
  // so the list keeps its own order and its preview until you ask for the card. Reordering or
  // unfolding on entry would make what you see depend on how you got here.
  const openedFor = useSyncExternalStore(
    subscribeToLocation,
    readOpenedSkill,
    () => "",
  );

  // Carries a count, not just a name: asking for the same skill twice is a real request, and
  // keying on the name alone makes every press after the first a no-op.
  const [madeRequest, setRequest] = useState<{
    name: string;
    count: number;
  } | null>(null);
  useEffect(
    () =>
      subscribeToSkillFocus((name) =>
        setRequest((previous) => ({
          name,
          count: (previous?.count ?? 0) + 1,
        })),
      ),
    [],
  );

  // Next hides the page with `<Activity>` instead of unmounting it, so leaving and coming back
  // to another skill of this plugin keeps everything below alive: the jump would otherwise
  // outlive the URL that produced it, leaving the list expanded on the previous skill's card
  // while the strip already named the new one.
  //
  // Cleared, not just masked. Masking alone revives the jump on returning to the skill it
  // belonged to, because the object identity never changed and the effect re-fires. The mask
  // stays as well: it covers the render in which the reset is still settling.
  const [seenOpened, setSeenOpened] = useState(openedFor);
  if (seenOpened !== openedFor) {
    setSeenOpened(openedFor);
    setRequest(null);
  }
  const request = madeRequest?.name === openedFor ? madeRequest : null;

  // A hidden `<Activity>` tree keeps its scroll offset, so returning here restores wherever a
  // previous jump left the page. Opening a different skill has to land at the top, which is the
  // whole promise of naming it in the strip instead of scrolling to it.
  //
  // Skips its first run rather than firing on mount: arriving here with the page already
  // scrolled is a back navigation, and Next restoring that position is wanted.
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    window.scrollTo(0, 0);
  }, [openedFor]);

  const focusedIndex =
    request === null
      ? -1
      : skills.findIndex((skill) => skill.name === request.name);

  useEffect(() => {
    if (request === null) return;
    // Runs after the render that revealed the card, so it exists by now. Focus as well as
    // scroll: moving the viewport without moving focus leaves a keyboard user behind.
    const card = document.getElementById(request.name);
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({ block: "center" });
  }, [request]);

  return (
    <CollapsibleGrid
      id={SKILL_LIST_ID}
      heading="Skills in this plugin"
      noun="skills"
      forceExpanded={focusedIndex >= PREVIEW}
      // The jump opens the grid from outside its own toggle, so releasing that is what lets the
      // toggle close it again.
      onCollapse={() => setRequest(null)}
      items={skills.map((skill) => {
        // The mark reads off the URL, not off the jump: it identifies the card once you are
        // looking at the list, whether or not you used the control to get there.
        const opened = skill.name === openedFor;
        return {
          key: skill.id,
          node: (
            <div
              id={skill.name}
              tabIndex={-1}
              aria-current={opened ? "true" : undefined}
              // No focus-visible variant: the jump only ever targets the opened skill, which
              // already carries border-accent, so it resolved to the same colour. The visible
              // focus indicator is the global :focus-visible outline in globals.css.
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
