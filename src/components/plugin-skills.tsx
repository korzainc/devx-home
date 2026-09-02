"use client";

import { useEffect, useState } from "react";
import { CollapsibleGrid, PREVIEW } from "@/components/collapsible-grid";
import type { SkillEntry } from "@/lib/catalogue";
import { SKILL_LIST_ID, subscribeToSkillFocus } from "@/lib/skill-link";

export function PluginSkills({ skills }: { skills: SkillEntry[] }) {
  // Nothing happens on arrival: the context strip above already names the skill you came for,
  // so the list keeps its own order and its preview until you ask for the card. Reordering or
  // unfolding on entry would make what you see depend on how you got here.
  // Carries a count, not just a name: asking for the same skill twice is a real request, and
  // keying on the name alone makes every press after the first a no-op.
  const [request, setRequest] = useState<{
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
      items={skills.map((skill) => ({
        key: skill.id,
        node: (
          <div
            id={skill.name}
            tabIndex={-1}
            className="scroll-mt-24 rounded-xl border border-line bg-surface p-4 focus:border-accent focus:outline-none"
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
      }))}
    />
  );
}
