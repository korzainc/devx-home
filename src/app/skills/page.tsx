import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CatalogueTabs } from "@/components/catalogue-tabs";
import { SkillsFirstRunNudge } from "@/components/skills-first-run";
import { plugins, skills } from "@/lib/catalogue";
import { parseFilterParam } from "@/lib/filter";

export const metadata: Metadata = {
  title: "Skills",
  description:
    "Plugins published to the Korza marketplace, and the skills they bundle.",
};

type Params = Pick<PageProps<"/skills">, "searchParams">;

// Awaited here rather than in the page so everything above it still prerenders: reading a
// request-time value in the page body would render the whole route on demand.
async function Tabs({ searchParams }: Params) {
  const params = await searchParams;
  return (
    <CatalogueTabs
      plugins={plugins}
      skills={skills}
      initialSkillFilters={{
        for: parseFilterParam(params.for),
        agent: parseFilterParam(params.agent),
        plugin: parseFilterParam(params.plugin),
        origin: parseFilterParam(params.origin),
      }}
    />
  );
}

export default function SkillsPage({ searchParams }: Params) {
  return (
    <div className="flex flex-col gap-10">
      {/* Renders nothing until a client has read localStorage, so the catalogue below is what
          the prerendered page and any no-JS client get. */}
      <SkillsFirstRunNudge />

      {/* Grouped with the title, so the link sits the same distance above it as "← Skills"
          does on the plugin page. As a direct child it inherited the section gap instead. */}
      <div className="flex flex-col gap-4">
        <Link
          href="/"
          className="w-fit font-mono text-xs text-ink-faint hover:text-accent"
        >
          ← Home
        </Link>
        {/* The fallback is the same tabs with no initial selection, so the prerendered shell
            already shows a usable catalogue and only the picks stream in. */}
        <Suspense
          fallback={<CatalogueTabs plugins={plugins} skills={skills} />}
        >
          <Tabs searchParams={searchParams} />
        </Suspense>
      </div>
    </div>
  );
}
