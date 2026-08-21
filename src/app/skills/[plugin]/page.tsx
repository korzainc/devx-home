import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlugin, installCommands, plugins } from "@/lib/catalogue";

// The catalogue is a static JSON file, so every plugin page is prerendered at build time.
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

  return (
    <article className="flex max-w-3xl flex-col gap-12">
      <header className="flex flex-col gap-4">
        <Link
          href="/skills"
          className="font-mono text-xs text-ink-faint hover:text-accent"
        >
          ← Skills
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-semibold tracking-tight">
            {plugin.name}
          </h1>
          <span className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[0.65rem] text-ink-faint">
            {plugin.ref}
          </span>
        </div>
        <p className="text-lg leading-relaxed text-ink-muted">
          {plugin.summary}
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
          What it solves
        </h2>
        <p className="leading-relaxed text-ink-muted">{plugin.problem}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
          What you get
        </h2>
        <ul className="flex flex-col gap-3">
          {plugin.benefits.map((benefit) => (
            <li
              key={benefit}
              className="border-l-2 border-accent pl-4 leading-relaxed text-ink-muted"
            >
              {benefit}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
          Install
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {installCommands(plugin).map((entry) => (
            <div
              key={entry.agent}
              className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
            >
              <span className="font-display text-sm font-medium">
                {entry.agent}
              </span>
              <code className="font-mono text-xs break-all text-ink select-all">
                {entry.install}
              </code>
              <span className="text-xs text-ink-faint">
                First time on this machine, register the marketplace:
              </span>
              <code className="font-mono text-xs break-all text-ink-muted select-all">
                {entry.register}
              </code>
            </div>
          ))}
        </div>
      </section>

      {plugin.skills.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
            Skills in this plugin ({plugin.skills.length})
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {plugin.skills.map((skill) => (
              <li
                key={skill}
                className="rounded bg-accent-wash px-2 py-1 font-mono text-xs text-ink-muted"
              >
                {skill}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2 border-t border-line pt-6 text-sm text-ink-faint">
        <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs">
          <span>Origin: {plugin.origin}</span>
          <span>Versioning: {plugin.versioning}</span>
        </div>
        <a
          href={plugin.homepage}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs text-ink-muted hover:text-accent"
        >
          {plugin.sourceRepo} →
        </a>
      </section>
    </article>
  );
}
