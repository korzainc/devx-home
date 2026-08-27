"use client";

import { useRef, useState } from "react";
import { PluginsCatalogue } from "@/components/plugins-catalogue";
import { SkillsCatalogue } from "@/components/skills-catalogue";
import type { PluginRow, SkillEntry } from "@/lib/catalogue";

type View = "plugins" | "skills";

// A tab, not a route: /skills/[plugin] is dynamic, so /skills/browse would collide with a
// plugin of that name. Plugins stay the default -- a plugin is what you install.
export function CatalogueTabs({
  plugins,
  skills,
  toolchain,
  placeholder,
}: {
  plugins: PluginRow[];
  /** The classified rows: everything the facets apply to. */
  skills: SkillEntry[];
  /** Setup and meta rows. Listed and searchable, but outside every facet. */
  toolchain: SkillEntry[];
  placeholder: boolean;
}) {
  const [view, setView] = useState<View>("plugins");
  const tabRefs = useRef<Record<View, HTMLButtonElement | null>>({
    plugins: null,
    skills: null,
  });

  // Tab counts every row the panel lists; the grid counts the classified ones. 42 + 9 = 51.
  const allSkills = [...skills, ...toolchain];

  const tabs: { id: View; label: string; count: number }[] = [
    { id: "plugins", label: "Plugins", count: plugins.length },
    { id: "skills", label: "Skills", count: allSkills.length },
  ];

  // Arrow keys move between tabs, per the WAI-ARIA tabs pattern. Without this the tablist role
  // promises keyboard behaviour the component does not implement.
  function onKeyDown(event: React.KeyboardEvent) {
    const order: View[] = ["plugins", "skills"];
    const delta =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next =
      order[(order.indexOf(view) + delta + order.length) % order.length];
    setView(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Browse by"
        onKeyDown={onKeyDown}
        className="flex w-fit gap-1 rounded-lg border border-line bg-surface p-1"
      >
        {tabs.map((tab) => {
          const isOn = view === tab.id;
          return (
            <button
              key={tab.id}
              id={`catalogue-tab-${tab.id}`}
              ref={(node) => {
                tabRefs.current[tab.id] = node;
              }}
              role="tab"
              type="button"
              aria-selected={isOn}
              aria-controls={`catalogue-panel-${tab.id}`}
              // Roving tabIndex: one stop for the whole tablist, arrows move within it.
              tabIndex={isOn ? 0 : -1}
              onClick={() => setView(tab.id)}
              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${
                isOn
                  ? "bg-accent-wash text-ink"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {tab.label}
              <span className="font-mono text-[0.65rem] text-ink-faint">
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Gated on `placeholder`, which is what makes the internal Linear link below safe: the
          notice and the link both disappear the moment the generated index replaces the
          hand-extracted file, which is the same moment this page is fit to publish. */}
      {view === "skills" && placeholder && (
        <p className="rounded-lg border border-line bg-surface-raised px-4 py-3 text-sm text-ink-muted">
          Preview. {allSkills.length} skills, read from the source repositories
          on 2026-08-26 and generated in CI once that lands. {toolchain.length}{" "}
          of them sit under Setup and toolchain at the foot of the page: the
          filters do not apply to them, though search still finds them.{" "}
          <span className="font-mono">Category</span> is a hand-authored
          classification, pending an agreed metadata standard.
        </p>
      )}

      {/* Both panels stay mounted, with the inactive one hidden. Mounting on selection was
          cheaper, but it reset every filter on each tab switch: filter the skills, flip to
          Plugins to show a card, come back, and the demo has to be set up again. The panel divs
          carry no display class, so the `hidden` attribute is not overridden. */}
      <div
        role="tabpanel"
        id="catalogue-panel-plugins"
        aria-labelledby="catalogue-tab-plugins"
        hidden={view !== "plugins"}
        tabIndex={0}
      >
        <PluginsCatalogue entries={plugins} />
      </div>
      <div
        role="tabpanel"
        id="catalogue-panel-skills"
        aria-labelledby="catalogue-tab-skills"
        hidden={view !== "skills"}
        tabIndex={0}
      >
        <SkillsCatalogue entries={skills} toolchain={toolchain} />
      </div>
    </div>
  );
}
