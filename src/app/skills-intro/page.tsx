import type { Metadata } from "next";
import Link from "next/link";
import {
  SkillsGlossaryNote,
  SkillsIntroPanes,
} from "@/components/skills-intro-panes";

export const metadata: Metadata = {
  title: "Introduction to skills",
  description:
    "What a skill is, how it fires, and how to get one, for anyone who has not installed a plugin before.",
};

/**
 * Deliberately not under `/skills/`: that segment is `[plugin]`, so a static sibling would
 * permanently shadow any plugin published under the same name. `catalogue-tabs.tsx` records the
 * team declining `/skills/browse` for exactly this reason. `/start` is left free for the
 * getting-started guide.
 */
export default function SkillsIntroPage() {
  return (
    <div className="flex min-h-[70vh] flex-col gap-10">
      <Link
        href="/skills"
        className="w-fit font-mono text-xs text-ink-faint hover:text-accent"
      >
        ← Skills
      </Link>

      <SkillsIntroPanes />

      {/* Pushed to the bottom edge, so the leftover height sits between the panes and the
          glossary rather than trailing underneath it. */}
      <div className="flex-1" />
      <SkillsGlossaryNote />
    </div>
  );
}
