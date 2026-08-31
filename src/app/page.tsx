import Link from "next/link";
import { baseline, plugins } from "@/lib/catalogue";

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

/* Each section says its piece once, inside the band. The heading outside carries no copy of its
   own, which is what keeps it working as the break between the two sections. */
function Section({
  heading,
  visual,
  children,
}: {
  heading: string;
  visual: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6">
      {/* Separates the two sections without a rule: a blurred accent bloom behind the heading.
          `isolate` keeps the negative z-index bloom from sliding behind the page background. */}
      <div className="relative isolate">
        <span
          aria-hidden
          className="absolute -top-8 -left-10 -z-10 h-28 w-72 rounded-full bg-accent/20 blur-3xl"
        />
        <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {heading}
        </h2>
      </div>
      <div className={band}>
        <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
          <div>{visual}</div>
          <div className="flex flex-col gap-5 px-1 sm:px-2">{children}</div>
        </div>
      </div>
    </section>
  );
}

/* The line that has to land first, so it takes the display face rather than body copy. */
const lead =
  "font-display text-2xl leading-snug font-medium tracking-tight text-ink";

/* Groups the sentence that asks for something with the control that does it. */
function Action({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}

function BottomLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="self-center pt-1 text-sm font-medium text-accent hover:underline"
    >
      {children}
    </Link>
  );
}

// Illustrative, and labelled as such on screen. The capability labels are read from the baseline
// rather than written here, so the preview cannot drift from what the analysis actually checks.
const exampleRun = [
  { id: "secrets", evidence: "kingfisher.yml" },
  { id: "sast", evidence: null },
  { id: "unit-tests", evidence: "vitest in package.json" },
  { id: "dependency-updates", evidence: null },
  { id: "lint-style", evidence: "eslint.config.mjs" },
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
        <h1 className="font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Everything Korza recommends, in one place.
        </h1>
        <p className="text-lg leading-relaxed text-ink-muted">
          A health check for your repo, and the catalogues behind what it
          recommends.
        </p>
      </div>

      <div className="flex flex-col gap-20">
        <Section heading="CI Tools" visual={<ReportPreview />}>
          <p className={lead}>
            The checks that keep every Korza pipeline consistent and every
            delivery up to standard.
          </p>

          <Action>
            <p className="text-sm text-ink-muted">
              See where yours falls short and fix it before it reaches a client.
            </p>
            {/* A plain GET form, so the field works before any JavaScript loads. The report page
                reads `repo` from the query string and runs the analysis on arrival. */}
            <form
              action="/gap-analysis"
              className="flex w-full flex-col gap-2 sm:flex-row"
            >
              {/* `required` rather than a disabled button, which would need this to be a client
                  component and would leave the empty submit working until the JS arrived. The
                  pattern is only "contains something that is not a space": anything stricter
                  would reject the full URLs that parseRepoRef accepts. */}
              <input
                name="repo"
                placeholder="owner/repo"
                aria-label="Repository to analyze"
                required
                pattern=".*\S.*"
                title="A GitHub repository, as owner/repo or a full github.com URL."
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
          </Action>

          <BottomLink href="/tools">Browse the checks →</BottomLink>
        </Section>

        <Section heading="Skills" visual={<MarketplacePreview />}>
          <div className="flex flex-col gap-2">
            <p className={lead}>Stop repeating yourself to your AI agents.</p>
            <p className="leading-relaxed text-ink-muted">
              Korza&apos;s skills marketplace offers fine-tuned workflows for
              engineering and business alike, keeping your agents consistent and
              your work moving.
            </p>
          </div>

          <p className="text-sm text-ink-muted">
            Start with the skills we recommend here.
          </p>

          <BottomLink href="/skills">Browse the marketplace →</BottomLink>
        </Section>
      </div>
    </div>
  );
}
