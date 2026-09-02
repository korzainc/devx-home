import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InstallPanel } from "@/components/install-panel";
import { MetaRow } from "@/components/meta-row";
import { PluginSkills } from "@/components/plugin-skills";
import { SkillContextStrip } from "@/components/skill-context-strip";
import {
  getPlugin,
  installCommands,
  plugins,
  shortAgents,
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

export default async function PluginPage({
  params,
}: PageProps<"/skills/[plugin]">) {
  const plugin = getPlugin((await params).plugin);
  if (!plugin) notFound();

  const skills = skillsForPlugin(plugin.id);
  const shipsNothing = skills.length === 0;
  const agents = shortAgents(plugin.agents);

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

      {/* Above the fold and outside the two-column block: the skill you clicked is the reason
          you are on this page, so it reads before what the plugin as a whole solves. Renders
          nothing when the page was opened directly.
          Not gated on skills.length: a plugin that resolves to no skills is exactly where a
          stale link most needs explaining, and pyright-lsp is that plugin today. */}
      <SkillContextStrip skills={skills} />

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

      {shipsNothing ? (
        <p className="rounded-xl border border-dashed border-line px-5 py-4 text-sm text-ink-muted">
          Nothing to install: this entry resolves to no skills today.
        </p>
      ) : (
        <InstallPanel commands={installCommands(plugin)} />
      )}

      {skills.length > 0 && <PluginSkills skills={skills} />}
    </article>
  );
}
