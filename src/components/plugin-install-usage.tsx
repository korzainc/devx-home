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
  if (
    !count.claudeNative &&
    !count.claudeKorza &&
    !count.codexNative &&
    !count.codexKorza
  )
    return null;
  return (
    <aside
      className="rounded-xl border border-line-strong bg-surface-raised px-5 py-4"
      aria-label="Recorded plugin installations"
    >
      <p className="text-xs text-ink-muted">Finding its way into workflows</p>
      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink">
        {count.claudeNative !== undefined && (
          <p>
            <strong className="font-mono text-xl">{count.claudeNative}</strong>{" "}
            {count.claudeNative === 1 ? "install" : "installs"} reported by
            Claude Code
          </p>
        )}
        {count.claudeKorza !== undefined && (
          <p>
            <strong className="font-mono text-xl">{count.claudeKorza}</strong>{" "}
            Claude Code {count.claudeKorza === 1 ? "install" : "installs"}{" "}
            through Korza CLI
          </p>
        )}
        {count.codexNative !== undefined && (
          <p>
            <strong className="font-mono text-xl">{count.codexNative}</strong>{" "}
            {count.codexNative === 1 ? "install" : "installs"} reported by Codex
          </p>
        )}
        {count.codexKorza !== undefined && (
          <p>
            <strong className="font-mono text-xl">{count.codexKorza}</strong>{" "}
            Codex {count.codexKorza === 1 ? "install" : "installs"} through
            Korza CLI
          </p>
        )}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Recorded from installations that opted in to monitoring. These are not
        download totals or unique users.
      </p>
      {((count.claudeNative !== undefined && count.claudeKorza !== undefined) ||
        (count.codexNative !== undefined &&
          count.codexKorza !== undefined)) && (
        <p className="mt-2 text-xs text-ink-muted">
          These counts can overlap. They are shown separately.
        </p>
      )}
    </aside>
  );
}
