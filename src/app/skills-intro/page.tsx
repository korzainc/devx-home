import type { Metadata } from "next";
import { BackLink } from "@/components/back-link";
import { SkillsIntroSeen } from "@/components/skills-intro-seen";
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
      <SkillsIntroSeen />
      {/* No `followHistory`: `site-footer.tsx` links this page from every route, so arrival from
          another section is the common case, not an edge one. The label names a place, and a
          reader who came from `/tools/biome` would otherwise click "Skills" and land back on
          `/tools/biome`. */}
      <BackLink href="/skills">Skills</BackLink>

      <SkillsIntroPanes />

      {/* Pushed to the bottom edge, so the leftover height sits between the panes and the
          glossary rather than trailing underneath it. */}
      <div className="flex-1" />
      <SkillsGlossaryNote />
    </div>
  );
}
