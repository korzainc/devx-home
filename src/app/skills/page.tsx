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
          four values. */}
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
        those refs are branches rather than tags, so those entries track
        whatever upstream ships next.
      </footer>
    </div>
  );
}
