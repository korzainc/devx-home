import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ToolsCatalogue } from "@/components/tools-catalogue";
import {
  capabilityLabels,
  publicToolEntry,
  visibleTools,
} from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "CI Tools",
  description: "CI tools Korza recommends, by check and language.",
};

type Params = Pick<PageProps<"/tools">, "searchParams">;

// Splits only. Whether a value names a real stack or check is decided in ToolsCatalogue, which is
// the side that holds both lists; anything else is dropped there rather than filtered on.
// A repeated key arrives as an array and is ignored, so `?stack=go&stack=java` reads as no pick
// at all instead of silently honouring one of the two.
function parseList(value: string | string[] | undefined): string[] {
  if (typeof value !== "string" || value.length === 0) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

// The promise is awaited here rather than in the page so that everything above it prerenders.
// Reading a request-time value in the page body would make the whole route render on demand.
async function Catalogue({ searchParams }: Params) {
  const params = await searchParams;
  return (
    <ToolsCatalogue
      entries={visibleTools.map(publicToolEntry)}
      capabilityLabels={capabilityLabels}
      initialStacks={parseList(params.stack)}
      initialChecks={parseList(params.check)}
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
          Checks worth having in a pipeline. Filter by the check a tool runs, or
          by the language it applies to.
        </p>
      </header>
      {/* The fallback is the same catalogue with no initial selection, so the prerendered shell
          already shows a usable control and only the initial check and language picks stream in. */}
      <Suspense
        fallback={
          <ToolsCatalogue
            entries={visibleTools.map(publicToolEntry)}
            capabilityLabels={capabilityLabels}
          />
        }
      >
        <Catalogue searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
