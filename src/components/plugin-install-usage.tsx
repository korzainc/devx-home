import { localSkillsPreview } from "@/lib/local-skills-preview";
import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { isOrgMember } from "@/lib/membership";
import { readPluginInstalls } from "@/lib/skill-usage";
import type { ReactNode } from "react";

function InstallUsageFrame({
  children,
  loading = false,
}: {
  children: ReactNode;
  loading?: boolean;
}) {
  return (
    <aside
      className="rounded-xl border border-line-strong bg-surface-raised px-5 py-4"
      aria-label={
        loading
          ? "Loading recorded installations"
          : "Recorded plugin installations"
      }
      aria-busy={loading || undefined}
    >
      <p className="text-xs text-ink-muted">Finding its way into workflows</p>
      <div className="mt-3 grid grid-cols-2 gap-x-5 text-sm text-ink">
        {children}
      </div>
    </aside>
  );
}

export function PluginInstallUsageLoading() {
  return (
    <InstallUsageFrame loading>
      {["Claude Code", "Codex"].map((client) => (
        <div key={client} aria-hidden="true">
          <div className="flex h-10 items-center">
            <span className="h-7 w-16 rounded bg-line motion-safe:animate-pulse" />
          </div>
          <p className="invisible mt-1">recorded installs via {client}</p>
        </div>
      ))}
    </InstallUsageFrame>
  );
}

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
    <InstallUsageFrame>
      {(
        [
          ["claude", "Claude Code"],
          ["codex", "Codex"],
        ] as const
      ).map(
        ([client, label]) =>
          count[client] !== undefined && (
            <div key={client} className="min-w-0">
              <strong className="block font-mono text-3xl leading-10 tracking-tight break-all">
                {count[client]}
              </strong>
              <p className="mt-1">
                recorded {count[client] === 1 ? "install" : "installs"} via{" "}
                {label}
              </p>
            </div>
          ),
      )}
    </InstallUsageFrame>
  );
}
