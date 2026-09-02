"use client";

import { useState } from "react";
import type { SkillEntry } from "@/lib/catalogue";

const PREVIEW = 5;

export function PluginSkills({ skills }: { skills: SkillEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? skills : skills.slice(0, PREVIEW);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
        Skills in this plugin ({skills.length})
      </h2>

      <div className="grid gap-3 lg:grid-cols-2">
        {shown.map((skill) => (
          <div
            key={skill.id}
            className="rounded-xl border border-line bg-surface p-4"
          >
            <span className="font-mono text-sm font-medium text-ink [overflow-wrap:anywhere]">
              <span className="text-accent">/</span>
              {skill.name}
            </span>
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-muted">
              {skill.summary || skill.description}
            </p>
          </div>
        ))}

        {skills.length > PREVIEW && (
          // One button rather than two that swap: activating one that then unmounts drops
          // focus to the body.
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((was) => !was)}
            className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            {expanded ? "Show fewer" : `Show all ${skills.length} skills`}
            <span aria-hidden className="ml-1.5 text-[0.65rem]">
              {expanded ? "▴" : "▾"}
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
