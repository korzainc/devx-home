"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CollapsibleGrid, PREVIEW } from "@/components/collapsible-grid";
import type { SkillEntry } from "@/lib/catalogue";

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
  // A card links to its own skill, which is usually past the preview. Derived rather than
  // synced into state, so collapsing stays live -- it drops the hash on the way.
  const hash = useSyncExternalStore(subscribeToHash, readHash, () => "");
  const target = skills.findIndex((skill) => skill.name === hash);

  useEffect(() => {
    if (hash)
      document.getElementById(hash)?.scrollIntoView({ block: "center" });
  }, [hash]);

  return (
    <CollapsibleGrid
      heading="Skills in this plugin"
      noun="skills"
      forceExpanded={target >= PREVIEW}
      onCollapse={() => {
        history.replaceState(null, "", location.pathname + location.search);
        // history.replaceState doesn't fire hashchange, so without this the
        // useSyncExternalStore snapshot above stays stale and the grid never
        // learns the hash is gone, leaving it stuck open.
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      }}
      items={skills.map((skill) => ({
        key: skill.id,
        node: (
          <div
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
        ),
      }))}
    />
  );
}
