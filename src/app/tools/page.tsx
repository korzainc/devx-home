import type { Metadata } from "next";
import Link from "next/link";
import { ToolsCatalogue } from "@/components/tools-catalogue";
import { visibleTools } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "CI Tools",
  description: "CI tools Korza recommends, by capability and stack.",
};

export default function ToolsPage() {
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
      <ToolsCatalogue entries={visibleTools} />
    </div>
  );
}
