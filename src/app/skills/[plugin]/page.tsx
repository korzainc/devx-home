import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InstallPanel } from "@/components/install-panel";
import { PluginSkills } from "@/components/plugin-skills";
import {
  getPlugin,
  installCommands,
  plugins,
  skillsForPlugin,
} from "@/lib/catalogue";

export function generateStaticParams() {
  return plugins.map((plugin) => ({ plugin: plugin.id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/skills/[plugin]">): Promise<Metadata> {
  const plugin = getPlugin((await params).plugin);
  if (!plugin) return {};
  return { title: plugin.name, description: plugin.summary };
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0">
      <span className="text-[0.65rem] tracking-wide text-ink-faint uppercase">
        {label}
      </span>
      <span className="text-right text-sm text-ink">{children}</span>
    </div>
  );
}

export default async function PluginPage({
  params,
}: PageProps<"/skills/[plugin]">) {
  const plugin = getPlugin((await params).plugin);
  if (!plugin) notFound();

  const skills = skillsForPlugin(plugin.id);
  // Derived from the index, so it cannot disagree with the skill list below.
  const shipsNothing = skills.length === 0;
  const agents = plugin.agents.map((agent) =>
    agent.split(" ")[0].toLowerCase(),
  );

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <Link
          href="/skills"
          className="w-fit font-mono text-xs text-ink-faint hover:text-accent"
        >
          ← Skills
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-3xl font-semibold tracking-tight">
            {plugin.name}
          </h1>
          <span className="rounded-md border border-line px-2 py-0.5 font-mono text-[0.7rem] text-ink-faint">
            {plugin.ref}
          </span>
        </div>
        <p className="max-w-2xl leading-relaxed text-ink-muted">
          {plugin.summary}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="grid gap-2 border-b border-line p-5 sm:grid-cols-[9rem_1fr] sm:gap-6">
            <h2 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
              What it solves
            </h2>
            <p className="text-sm leading-relaxed text-ink-muted">
              {plugin.problem}
            </p>
          </div>
          <div className="grid gap-2 p-5 sm:grid-cols-[9rem_1fr] sm:gap-6">
            {/* pyright-lsp's first bullet is "Does not currently work", so the heading follows
                the content. */}
            <h2 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
              {shipsNothing ? "Known defect" : "What you get"}
            </h2>
            <ul className="flex flex-col gap-2.5">
              {plugin.benefits.map((benefit) => (
                <li
                  key={benefit}
                  className="flex gap-3 text-sm leading-relaxed text-ink-muted"
                >
                  <span aria-hidden className="shrink-0 text-accent">
                    •
                  </span>
                  {benefit}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface">
          <MetaRow label="Origin">{plugin.origin}</MetaRow>
          <MetaRow label="Skills">
            <span className="font-mono">{skills.length}</span>
          </MetaRow>
          <MetaRow label="Agents">
            <span className="font-mono">{agents.join(" · ")}</span>
          </MetaRow>
          <MetaRow label="Source">
            <a
              href={plugin.homepage}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-accent hover:underline"
            >
              {plugin.sourceRepo} →
            </a>
          </MetaRow>
        </div>
      </div>

      <InstallPanel commands={installCommands(plugin)} />

      {/* From the index; plugin.skills says zero for codezen. */}
      {skills.length > 0 && <PluginSkills skills={skills} />}
    </article>
  );
}
