import type { Metadata } from "next";
import { CatalogueTabs } from "@/components/catalogue-tabs";
import {
  browsableSkills,
  indexSchemaVersion,
  pluginRows,
  skillsArePlaceholder,
  toolchainSkills,
} from "@/lib/catalogue";

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
          Browse by skill to find one by the job it does. Sources live in their
          own repos; this is a catalogue, not an installer.
        </p>
      </header>
      <CatalogueTabs
        plugins={pluginRows}
        skills={browsableSkills}
        toolchain={toolchainSkills}
        placeholder={skillsArePlaceholder}
      />

      {/* Where the numbers came from. Pre-empts "is this real?" and makes the generated-index
          promise concrete: once CI produces the file, the commit replaces the date.

          It says "entries", not "five source repositories": pyright-lsp contributes no skills,
          so the index came from four repos, and the Plugin facet on the next tab lists exactly
          four values. It also says "ref", not "version the catalogue pins", because three of the
          five track a branch and are labelled Unpinned on the same screen. */}
      <footer className="border-t border-line pt-4 font-mono text-xs text-ink-faint">
        Skill index: schema v{indexSchemaVersion}. Read on 2026-08-26 from the
        entries listed in{" "}
        <a
          href="https://github.com/korzainc/marketplace"
          className="hover:text-accent"
        >
          korzainc/marketplace
        </a>
        , each at the ref the catalogue records
        {skillsArePlaceholder && ", by hand pending the generator"}. Three of
        those refs are branches rather than tags, which the Pin filter names.
        Version drift read from upstream tags the same day.
      </footer>
    </div>
  );
}
