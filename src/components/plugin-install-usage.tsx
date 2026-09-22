import { localSkillsPreview } from "@/lib/local-skills-preview";
import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { isOrgMember } from "@/lib/membership";
import { readPluginInstalls } from "@/lib/skill-usage";

export async function PluginInstallUsage({ plugin }: { plugin: string }) {
  let count;
  try {
    const preview = localSkillsPreview((await headers()).get("host"));
    const session = preview ? null : await getSession();
    if (
      !preview &&
      (!session || !(await isOrgMember(await headers(), session.user)))
    )
      return null;
    count = await readPluginInstalls(plugin);
  } catch {
    return null;
  }
  if (count === undefined) return null;
  return (
    <aside
      className="rounded-xl border border-accent/50 bg-accent-wash px-5 py-4"
      aria-label="Recorded plugin installations"
    >
      <p className="text-xs text-ink-muted">Finding its way into workflows</p>
      <p className="mt-1 text-sm text-ink">
        <strong className="font-mono text-xl">{count}</strong> recorded{" "}
        {count === 1 ? "install" : "installs"} via Claude Code
      </p>
    </aside>
  );
}
