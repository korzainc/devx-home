import type { Metadata } from "next";
import { ToolsCatalogue } from "@/components/tools-catalogue";
import { tools } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Tools",
  description: "CI tools Korza recommends, by capability and stack.",
};

export default function ToolsPage() {
  return (
    <div className="flex flex-col gap-10">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Tools</h1>
        <p className="leading-relaxed text-ink-muted">
          Checks worth having in a pipeline. Filter by what a tool does, or by
          the stack it applies to.
        </p>
      </header>
      <ToolsCatalogue entries={tools} />
    </div>
  );
}
