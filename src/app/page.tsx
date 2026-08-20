import Link from "next/link";
import { skills, tools } from "@/lib/catalogue";

const sections = [
  {
    href: "/tools",
    title: "Tools",
    description:
      "The CI checks Korza recommends, what each one covers, and which stacks they apply to.",
    meta: `${tools.length} tools`,
  },
  {
    href: "/skills",
    title: "Skills",
    description:
      "Agent skills published to the marketplace, filterable by the agent that runs them.",
    meta: `${skills.length} skills`,
  },
];

const upcoming = [
  {
    title: "Gap analysis",
    description:
      "Point it at a repo. It reads the manifests and CI config, then reports which recommended checks are missing.",
  },
  {
    title: "Changelog",
    description:
      "What changed in the tooling and when, written by hand rather than generated from commits.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-16">
      <section className="flex max-w-2xl flex-col gap-4 pt-8">
        <p className="font-mono text-xs tracking-wide text-accent uppercase">
          Developer Experience
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Everything Korza recommends, in one place.
        </h1>
        <p className="text-lg leading-relaxed text-ink-muted">
          The tools worth adding to a pipeline, the agent skills worth
          installing, and — soon — a straight answer about what your repo is
          missing.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="group flex flex-col gap-3 rounded-xl border border-line bg-surface p-6 transition-colors hover:border-line-strong hover:bg-surface-raised"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-medium group-hover:text-accent">
                {section.title}
              </h2>
              <span className="font-mono text-xs text-ink-faint">
                {section.meta}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-ink-muted">
              {section.description}
            </p>
            <span className="font-mono text-xs text-ink-faint group-hover:text-accent">
              browse →
            </span>
          </Link>
        ))}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-medium tracking-wide text-ink-faint uppercase">
          Not built yet
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {upcoming.map((item) => (
            <div
              key={item.title}
              className="flex flex-col gap-2 rounded-xl border border-dashed border-line p-6"
            >
              <h3 className="font-medium text-ink-muted">{item.title}</h3>
              <p className="text-sm leading-relaxed text-ink-faint">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
