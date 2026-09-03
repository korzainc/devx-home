import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CollapsibleGrid } from "@/components/collapsible-grid";
import { MetaRow } from "@/components/meta-row";
import { bundles, isBundle, tools } from "@/lib/catalogue";
import { docsLabel } from "@/lib/docs-label";

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

  // A wrapped tool keeps its own page (gap analysis needs its detect signals), but it isn't
  // one of the /tools grid's own cards, so nothing else points a reader back to its bundle.
  const wrappingBundle = bundles.find((bundle) =>
    bundle.wraps.some((wrap) => wrap.tool === entry.id),
  );

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <Link
          href="/tools"
          className="w-fit font-mono text-xs text-ink-faint hover:text-accent"
        >
          ← CI Tools
        </Link>
        <h1 className="font-mono text-3xl font-semibold tracking-tight">
          {entry.name}
        </h1>
        <p className="max-w-2xl leading-relaxed text-ink-muted">
          {entry.summary}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="grid gap-2 border-b border-line p-5 sm:grid-cols-[9rem_1fr] sm:gap-6">
            <h2 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
              What it solves
            </h2>
            <p className="text-sm leading-relaxed text-ink-muted">
              {entry.problem}
            </p>
          </div>
          <div className="grid gap-2 p-5 sm:grid-cols-[9rem_1fr] sm:gap-6">
            <h2 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
              What you get
            </h2>
            <ul className="flex flex-col gap-2.5">
              {entry.benefits.map((benefit) => (
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
          {wrappingBundle && (
            <MetaRow label="Part of">
              <Link
                href={`/tools/${wrappingBundle.id}`}
                className="font-mono text-accent hover:underline"
              >
                {wrappingBundle.name} →
              </Link>
            </MetaRow>
          )}
          <MetaRow label="Category">{entry.category}</MetaRow>
          <MetaRow label="Capabilities">
            <span className="flex flex-wrap justify-end gap-1.5">
              {entry.capabilities.map((capability) => (
                <span
                  key={capability}
                  className="rounded bg-accent-wash px-1.5 py-0.5 font-mono text-[0.65rem] text-ink-muted"
                >
                  {capability}
                </span>
              ))}
            </span>
          </MetaRow>
          <MetaRow label="Stacks">
            <span className="flex flex-wrap justify-end gap-1.5">
              {entry.stacks.map((stack) => (
                <span
                  key={stack}
                  className="rounded bg-accent-wash px-1.5 py-0.5 font-mono text-[0.65rem] text-ink-muted"
                >
                  {stack}
                </span>
              ))}
            </span>
          </MetaRow>
          <MetaRow label="Docs">
            <a
              href={entry.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-accent hover:underline"
            >
              {docsLabel(entry.docsUrl)} →
            </a>
          </MetaRow>
        </div>
      </div>

      {isBundle(entry) && (
        <CollapsibleGrid
          heading="Tools in this bundle"
          noun="tools"
          items={entry.wraps.map((wrap) => {
            const wrappedTool = tools.find((tool) => tool.id === wrap.tool);
            return {
              key: wrap.tool,
              node: (
                <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
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
                </div>
              ),
            };
          })}
        />
      )}
    </article>
  );
}
