import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isBundle, tools } from "@/lib/catalogue";

// The catalogue is a static JSON file, so every tool/bundle page is prerendered at build time.
export function generateStaticParams() {
  return tools.map((tool) => ({ id: tool.id }));
}

function getEntry(id: string) {
  return tools.find((tool) => tool.id === id);
}

export async function generateMetadata({
  params,
}: PageProps<"/tools/[id]">): Promise<Metadata> {
  const entry = getEntry((await params).id);
  if (!entry) return {};
  return { title: entry.name, description: entry.summary };
}

export default async function ToolPage({ params }: PageProps<"/tools/[id]">) {
  const entry = getEntry((await params).id);
  if (!entry) notFound();

  return (
    <article className="flex max-w-3xl flex-col gap-12">
      <header className="flex flex-col gap-4">
        <Link
          href="/tools"
          className="font-mono text-xs text-ink-faint hover:text-accent"
        >
          ← CI Tools
        </Link>
        <h1 className="font-mono text-2xl font-semibold tracking-tight">
          {entry.name}
        </h1>
        <p className="text-lg leading-relaxed text-ink-muted">
          {entry.summary}
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
          What it solves
        </h2>
        <p className="leading-relaxed text-ink-muted">{entry.problem}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
          What you get
        </h2>
        <ul className="flex flex-col gap-3">
          {entry.benefits.map((benefit) => (
            <li key={benefit} className="flex gap-3">
              <span aria-hidden className="shrink-0 font-mono text-ink-faint">
                ›
              </span>
              <span className="leading-relaxed text-ink-muted">{benefit}</span>
            </li>
          ))}
        </ul>
      </section>

      {isBundle(entry) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
            Tools used in this bundle
          </h2>
          <ul className="flex flex-col gap-3">
            {entry.wraps.map((wrap) => {
              const wrappedTool = tools.find((tool) => tool.id === wrap.tool);
              return (
                <li
                  key={wrap.tool}
                  className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    {wrappedTool ? (
                      <Link
                        href={`/tools/${wrappedTool.id}`}
                        className="font-display text-sm font-medium hover:text-accent"
                      >
                        {wrappedTool.name}
                      </Link>
                    ) : (
                      <span className="font-display text-sm font-medium">
                        {wrap.tool}
                      </span>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {wrap.capabilities.map((capability) => (
                        <span
                          key={capability}
                          className="rounded bg-accent-wash px-1.5 py-0.5 font-mono text-[0.65rem] text-ink-muted"
                        >
                          {capability}
                        </span>
                      ))}
                    </div>
                  </div>
                  {wrappedTool && (
                    <p className="text-sm leading-relaxed text-ink-muted">
                      {wrappedTool.summary}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-2 border-t border-line pt-6 text-sm text-ink-faint">
        <a
          href={entry.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs text-ink-muted hover:text-accent"
        >
          {entry.docsUrl} →
        </a>
      </section>
    </article>
  );
}
