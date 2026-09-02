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
  // A new object per press, so the effect below re-runs even when the same skill is asked for
  // twice. Keying on the name alone made every press after the first a no-op.
  const [request, setRequest] = useState<{ name: string } | null>(null);
  useEffect(() => subscribeToSkillFocus((name) => setRequest({ name })), []);

  // A jump is a transient interaction, not view state, so it is undone when this page is
  // hidden — the reset `preserving-ui-state.md` prescribes for exactly this case, in a layout
  // effect so it runs synchronously before the page goes away.
  //
  // Next hides pages with `<Activity>` rather than unmounting them, so without this the jump
  // outlives the visit: coming back to the plugin re-ran it, focusing the previous skill's card
  // and dragging the viewport to it. Measured, not reasoned — jsdom cannot hide a tree, so the
  // proof for this one is a CDP run, not a unit test.
  useLayoutEffect(() => () => setRequest(null), []);

  // Belt and braces for a skill change inside a live tree. The cleanup above covers leaving
  // and returning, which is the path a reader actually takes; this covers the URL moving while
  // the list stays mounted.
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
