"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { PluginsCatalogue } from "@/components/plugins-catalogue";
import { SkillsGlossaryLine } from "@/components/skills-glossary-line";
import { SkillsCatalogue } from "@/components/skills-catalogue";
import {
  skillCountByPlugin,
  type PluginEntry,
  type SkillEntry,
} from "@/lib/catalogue-entries";

type View = "plugins" | "skills";

// A tab, not a route: /skills/[plugin] is dynamic, so /skills/browse would collide with a
// plugin of that name. Plugins stay the default -- a plugin is what you install.
export function CatalogueTabs({
  plugins,
  skills,
  initialSkillFilters = {},
}: {
  plugins: PluginEntry[];
  skills: SkillEntry[];
  /** Skills selections off the query string, keyed by URL param. */
  initialSkillFilters?: Record<string, string[]>;
}) {
  // A link carrying skills filters is a link to the skills panel: opening on Plugins would apply
  // them where the reader cannot see them, and the first tab click would then look like it had
  // filtered something itself.
  const [view, setView] = useState<View>(
    Object.values(initialSkillFilters).some((values) => values.length > 0)
      ? "skills"
      : "plugins",
  );
  const tabRefs = useRef<Record<View, HTMLButtonElement | null>>({
    plugins: null,
    skills: null,
  });

  // A plugin card's own skill count, computed client-side from rows already in props - the
  // alternative (importing skillsForPlugin) would pull the whole catalogue module, detect
  // signals included, into the browser bundle along with it.
  const skillCounts = skillCountByPlugin(skills);

  const tabs: { id: View; label: string; count: number }[] = [
    { id: "plugins", label: "Plugins", count: plugins.length },
    { id: "skills", label: "Skills", count: skills.length },
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
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Skills
          </h1>
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
                      ? "border border-line-strong bg-accent-wash text-ink"
                      : "border border-transparent text-ink-muted hover:text-ink"
                  }`}
                >
                  {tab.label}
                  <span
                    className={`font-mono text-[0.65rem] ${isOn ? "text-ink" : "text-ink-faint"}`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Static across both tabs, deliberately: both terms hold on either tab, and the
            paragraph that used to swap here re-flowed the heading block on every tab change,
            which moved the grid underneath it. */}
        <SkillsGlossaryLine
          className="text-sm text-ink-muted"
          terms={[
            ["plugin", "what you install"],
            ["skill", "what does the work"],
          ]}
        />

        {/* Sits with the definitions rather than in the header: someone who reads those two
            lines and wants more is already looking here. */}
        <Link
          href="/skills-intro"
          className="w-fit text-xs text-accent underline decoration-accent/40 underline-offset-4 transition-colors hover:text-ink hover:decoration-line-strong"
        >
          Introduction to skills
        </Link>
      </div>

      {/* Both panels stay mounted, with the inactive one hidden. Mounting on selection was
          cheaper, but it reset every filter on each tab switch: filter the skills, flip to
          Plugins to show a card, come back, and the demo has to be set up again. The panel divs
          carry no display class, so the `hidden` attribute is not overridden. */}
      <div
        role="tabpanel"
        id="catalogue-panel-plugins"
        aria-labelledby="catalogue-tab-plugins"
        hidden={view !== "plugins"}
      >
        <PluginsCatalogue entries={plugins} skillCounts={skillCounts} />
      </div>
      <div
        role="tabpanel"
        id="catalogue-panel-skills"
        aria-labelledby="catalogue-tab-skills"
        hidden={view !== "skills"}
      >
        <SkillsCatalogue entries={skills} initial={initialSkillFilters} />
      </div>
    </div>
  );
}
