import { localSkillsPreview } from "@/lib/local-skills-preview";
import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { isOrgMember } from "@/lib/membership";
import { readSkillUsage } from "@/lib/skill-usage";
import type { SkillEntry } from "@/lib/catalogue-entries";
import { PluginSkills } from "./plugin-skills";

export function PluginSkillsWithUsage({
  plugin,
  skills,
}: {
  plugin: string;
  skills: SkillEntry[];
}) {
  // Keep the interactive list mounted while one shared read supplies its badges.
  // Only the badge components unwrap this promise inside their own Suspense boundaries.
  return (
    <PluginSkills
      plugin={plugin}
      skills={skills}
      usagePromise={usageForPlugin(plugin, skills)}
    />
  );
}

async function usageForPlugin(plugin: string, skills: SkillEntry[]) {
  try {
    const requestHeaders = await headers();
    const preview = localSkillsPreview(requestHeaders.get("host"));
    const session = preview ? null : await getSession();
    if (
      preview ||
      (session && (await isOrgMember(requestHeaders, session.user)))
    ) {
      return await readSkillUsage(
        plugin,
        skills.map((skill) => skill.name),
      );
    }
  } catch {
    // Missing telemetry must not prevent browsing or imply zero usage.
  }
}
