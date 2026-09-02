import type { Metadata } from "next";
import Link from "next/link";
import { CatalogueTabs } from "@/components/catalogue-tabs";
import {
  browsableSkills,
  indexSchemaVersion,
  plugins,
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
      {/* Grouped with the title, so the link sits the same distance above it as "← Skills"
          does on the plugin page. As a direct child it inherited the section gap instead. */}
      <div className="flex flex-col gap-4">
        <Link
          href="/"
          className="w-fit font-mono text-xs text-ink-faint hover:text-accent"
        >
          ← Home
        </Link>
        <CatalogueTabs
          plugins={plugins}
          skills={browsableSkills}
          toolchain={toolchainSkills}
        />
      </div>

      {/* Provenance only. A date or a tally written here goes stale the next time the index
          is regenerated, and deriving the tally from skill rows undercounts: an entry that
          ships no skills has no rows. Each entry's ref is on its own page instead. */}
      <footer className="border-t border-line pt-4 font-mono text-xs text-ink-faint">
        Skill index: schema v{indexSchemaVersion}, generated from the entries
        listed in{" "}
        <a
          href="https://github.com/korzainc/marketplace"
          className="hover:text-accent"
        >
          korzainc/marketplace
        </a>
        , each at the ref the catalogue records, which each entry&rsquo;s page
        shows beside its name.
      </footer>
    </div>
  );
}
