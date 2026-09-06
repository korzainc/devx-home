import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ToolsCatalogue } from "@/components/tools-catalogue";
import { publicToolEntry, visibleTools } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "CI Tools",
  description: "CI tools Korza recommends, by capability and stack.",
};

type Params = Pick<PageProps<"/tools">, "searchParams">;

function parseList(value: string | string[] | undefined): string[] {
  return typeof value === "string" ? value.split(",") : [];
}

// The promise is awaited here rather than in the page so that everything above it prerenders.
// Reading a request-time value in the page body would make the whole route render on demand.
async function Catalogue({ searchParams }: Params) {
  const params = await searchParams;
  return (
    <ToolsCatalogue
      entries={visibleTools.map(publicToolEntry)}
      initialStacks={parseList(params.stack)}
      initialCapabilities={parseList(params.cap)}
    />
  );
}

export default function ToolsPage({ searchParams }: Params) {
  return (
    <div className="flex flex-col gap-10">
      <header className="flex max-w-2xl flex-col gap-4">
        <Link
          href="/"
          className="w-fit font-mono text-xs text-ink-faint hover:text-accent"
        >
          ← Home
        </Link>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          CI Tools
        </h1>
        <p className="leading-relaxed text-ink-muted">
          Checks worth having in a pipeline. Filter by what a tool does, or by
          the stack it applies to.
        </p>
      </header>
      {/* The fallback is the same catalogue with no initial selection, so the prerendered shell
          already shows a usable control and only the initial Stack/Capability picks stream in. */}
      <Suspense
        fallback={
          <ToolsCatalogue entries={visibleTools.map(publicToolEntry)} />
        }
      >
        <Catalogue searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
