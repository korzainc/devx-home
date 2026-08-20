import type { Metadata } from "next";
import { SkillsCatalogue } from "@/components/skills-catalogue";
import { skills } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Skills",
  description: "Agent skills published to the Korza marketplace.",
};

export default function SkillsPage() {
  return (
    <div className="flex flex-col gap-10">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Skills</h1>
        <p className="leading-relaxed text-ink-muted">
          Published to the marketplace and installed from there — this page is a
          catalogue, not an installer. Cards link out.
        </p>
      </header>
      <SkillsCatalogue entries={skills} />
    </div>
  );
}
