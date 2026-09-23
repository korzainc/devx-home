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
  if (!count.claude && !count.codex) return null;
  return (
    <aside
      className="rounded-xl border border-line-strong bg-surface-raised px-5 py-4"
      aria-label="Recorded plugin installations"
    >
      <p className="text-xs text-ink-muted">Finding its way into workflows</p>
      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink">
        {count.claude !== undefined && (
          <p>
            <strong className="font-mono text-xl">{count.claude}</strong>{" "}
            recorded {count.claude === 1 ? "install" : "installs"} via Claude
            Code
          </p>
        )}
        {count.codex !== undefined && (
          <p>
            <strong className="font-mono text-xl">{count.codex}</strong> Codex{" "}
            {count.codex === 1 ? "install" : "installs"} through Korza CLI
          </p>
        )}
      </div>
    </aside>
  );
}
