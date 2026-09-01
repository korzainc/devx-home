import { CollapsibleGrid } from "@/components/collapsible-grid";
import type { SkillEntry } from "@/lib/catalogue";

export function PluginSkills({ skills }: { skills: SkillEntry[] }) {
  return (
    <CollapsibleGrid
      heading="Skills in this plugin"
      noun="skills"
      items={skills.map((skill) => ({
        key: skill.id,
        node: (
          <div className="rounded-xl border border-line bg-surface p-4">
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
