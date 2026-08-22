import Link from "next/link";
import { baseline, plugins, tools } from "@/lib/catalogue";

/* The band's outline is a masked overlay rather than a border on the element itself, which is the
   only way to have it fade out along the bottom. Closed at the top, open at the bottom, so two
   bands in a column do not read as a stack of boxes. */
const band =
  "relative rounded-2xl bg-linear-to-br from-accent-wash/60 via-surface/50 to-transparent p-4 sm:p-7 " +
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-2xl after:border " +
  "after:border-line-strong after:mask-b-from-20% after:mask-b-to-90%";

/* Sits inside the band, so it needs its own surface and a shadow to stay forward of the wash. */
const panel =
  "flex h-full flex-col rounded-xl border border-line bg-canvas p-5 shadow-sm";

function Band({
  visual,
  children,
}: {
  visual: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={band}>
      <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
        <div>{visual}</div>
        <div className="flex flex-col gap-4 px-1 sm:px-2">{children}</div>
      </div>
    </section>
  );
}

// Illustrative, and labelled as such on screen. The capability labels are read from the baseline
// rather than written here, so the preview cannot drift from what the analysis actually checks.
const exampleRun = [
  { id: "secret-scanning", evidence: "kingfisher.yml" },
  { id: "sast", evidence: null },
  { id: "unit-tests", evidence: "vitest in package.json" },
  { id: "dependency-updates", evidence: null },
  { id: "lint", evidence: "eslint.config.mjs" },
];

function ReportPreview() {
  const missing = exampleRun.filter((row) => row.evidence === null).length;

  return (
    <div className={`${panel} gap-3`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-sm text-ink">your-org/service-api</span>
        <span className="font-mono text-xs text-ink-faint">
          {missing} of {exampleRun.length} missing
        </span>
      </div>
      <div className="flex flex-col">
        {exampleRun.map((row) => (
          <div
            key={row.id}
            className="flex items-baseline justify-between gap-3 border-t border-line py-2.5"
          >
            <span className="text-sm text-ink">
              {baseline.capabilities[row.id].label}
            </span>
            {row.evidence ? (
              <span className="font-mono text-xs text-ink-faint">
                {row.evidence}
              </span>
            ) : (
              <span className="rounded-md border border-accent bg-accent-wash px-1.5 py-0.5 font-mono text-[0.65rem] text-accent">
                missing
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-faint">Example run</p>
    </div>
  );
}

function MarketplacePreview() {
  return (
    <div className={`${panel} gap-3`}>
      {plugins.slice(0, 4).map((plugin) => (
        <div
          key={plugin.id}
          className="flex items-baseline justify-between gap-3 border-b border-line pb-3"
        >
          <span className="font-mono text-sm text-ink">{plugin.name}</span>
          <span className="text-xs text-ink-faint">
            {plugin.agents.join(", ")}
          </span>
        </div>
      ))}
      <p className="mt-auto rounded-lg bg-surface px-3 py-2 font-mono text-xs text-ink-muted">
        <span className="text-accent">/plugin</span> install
        codezen@korza-marketplace
      </p>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex flex-col gap-14">
      <div className="flex max-w-2xl flex-col gap-4 pt-8">
        <p className="font-mono text-xs tracking-wide text-accent uppercase">
          Developer Experience
        </p>
        <h1 className="font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Everything Korza recommends, in one place.
        </h1>
        <p className="text-lg leading-relaxed text-ink-muted">
          A health check for your repo, and the catalogues behind what it
          recommends.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        <Band visual={<ReportPreview />}>
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              Is your pipeline missing anything?
            </h2>
            <p className="leading-relaxed text-ink-muted">
              Point it at a GitHub repository. It reads the manifests and CI
              config, then reports which of the {tools.length} checks Korza
              recommends are not running, and names the file each result came
              from.
            </p>
            <Link
              href="/tools"
              className="text-sm font-medium text-accent hover:underline"
            >
              Browse the checks →
            </Link>
          </div>

          {/* A plain GET form, so the field works before any JavaScript loads. The report page
              reads `repo` from the query string and runs the analysis on arrival. */}
          <form
            action="/gap-analysis"
            className="flex w-full flex-col gap-2 sm:flex-row"
          >
            <input
              name="repo"
              placeholder="owner/repo"
              aria-label="Repository to analyze"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint"
            />
            <button
              type="submit"
              className="rounded-lg border border-accent bg-accent-wash px-4 py-2 text-sm font-medium whitespace-nowrap text-accent transition-opacity hover:opacity-80"
            >
              Analyze
            </button>
          </form>
        </Band>

        <Band visual={<MarketplacePreview />}>
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              Skills your agent should have.
            </h2>
            <p className="leading-relaxed text-ink-muted">
              {plugins.length} plugins on the Korza marketplace, the skills each
              one bundles, and the command to install it in Claude Code or
              Codex.
            </p>
            <Link
              href="/skills"
              className="text-sm font-medium text-accent hover:underline"
            >
              Browse the marketplace →
            </Link>
          </div>
        </Band>
      </div>
    </div>
  );
}
