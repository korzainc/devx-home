import { localSkillsPreview } from "@/lib/local-skills-preview";
import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { isOrgMember } from "@/lib/membership";
import { readSkillUsage } from "@/lib/skill-usage";
import type { SkillEntry } from "@/lib/catalogue-entries";
import { PluginSkills } from "./plugin-skills";

export async function PluginSkillsWithUsage({
  plugin,
  skills,
}: {
  plugin: string;
  skills: SkillEntry[];
}) {
  let usage;
  try {
    const preview = localSkillsPreview((await headers()).get("host"));
    const session = preview ? null : await getSession();
    if (
      preview ||
      (session && (await isOrgMember(await headers(), session.user)))
    ) {
      usage = await readSkillUsage(
        plugin,
        skills.map((skill) => skill.name),
      );
    }
  } catch {
    // Missing telemetry must not prevent browsing or imply zero usage.
  }
  return <PluginSkills plugin={plugin} skills={skills} usage={usage} />;
}
