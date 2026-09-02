"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { SkillEntry } from "@/lib/catalogue";

const PREVIEW = 5;

const readHash = () => {
  const raw = window.location.hash.slice(1);
  // A hand-typed "#%" is not valid encoding. Decoding throws during render, which takes the
  // whole list down rather than failing to find one skill.
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function PluginSkills({ skills }: { skills: SkillEntry[] }) {
  const [expanded, setExpanded] = useState(false);
  // A card links to its own skill, which is usually past the preview. Derived rather than
  // synced into state, so collapsing stays live -- it drops the hash on the way.
  const hash = useSyncExternalStore(subscribeToHash, readHash, () => "");
  const target = skills.findIndex((skill) => skill.name === hash);
  const showAll = expanded || target >= PREVIEW;

  useEffect(() => {
    if (hash)
      document.getElementById(hash)?.scrollIntoView({ block: "center" });
  }, [hash]);
  const shown = showAll ? skills : skills.slice(0, PREVIEW);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
        Skills in this plugin ({skills.length})
      </h2>

      <div className="grid gap-3 lg:grid-cols-2">
        {shown.map((skill) => (
          <div
            key={skill.id}
            id={skill.name}
            className="scroll-mt-24 rounded-xl border border-line bg-surface p-4 target:border-line-strong"
          >
            <span className="font-mono text-sm font-medium text-ink [overflow-wrap:anywhere]">
              <span className="text-accent">/</span>
              {skill.name}
            </span>
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-muted">
              {skill.summary ?? skill.description}
            </p>
          </div>
        ))}

        {skills.length > PREVIEW && (
          // One button rather than two that swap: activating one that then unmounts drops
          // focus to the body.
          <button
            type="button"
            aria-expanded={showAll}
            onClick={() => {
              if (showAll)
                history.replaceState(
                  null,
                  "",
                  location.pathname + location.search,
                );
              setExpanded(!showAll);
            }}
            className="rounded-xl border border-dashed border-line p-4 text-sm text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            {showAll ? "Show fewer" : `Show all ${skills.length} skills`}
            <span aria-hidden className="ml-1.5 text-[0.65rem]">
              {showAll ? "▴" : "▾"}
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
