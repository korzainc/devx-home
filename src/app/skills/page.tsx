import type { Metadata } from "next";
import { PluginsCatalogue } from "@/components/plugins-catalogue";
import { pluginRows } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Skills",
  description:
    "Plugins published to the Korza marketplace, and the skills they bundle.",
};

export default function SkillsPage() {
  return (
    <div className="flex flex-col gap-10">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Skills
        </h1>
        <p className="leading-relaxed text-ink-muted">
          Skills ship as plugins, so a plugin is what you install. Open one to
          see what it solves and how to install it in Claude Code or Codex.
          Sources live in their own repos; this is a catalogue, not an
          installer.
        </p>
      </header>
      <PluginsCatalogue entries={pluginRows} />
    </div>
  );
}
