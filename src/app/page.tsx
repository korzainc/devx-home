import Link from "next/link";
import { DrawMarks } from "@/components/draw-marks";
import { SkillPicker, type SkillCard } from "@/components/skill-picker";
import { SnapScroll } from "@/components/snap-scroll";
import { capabilityLabel, skills, type CapabilityId } from "@/lib/catalogue";
import { getUpdates } from "@/lib/updates";

/**
 * One panel, one screenful, one snap target.
 *
 * `100svh` rather than `100vh`: on a phone `vh` is the height with the browser chrome retracted,
 * so every panel would overflow by the address bar until you scrolled. The 4rem is the sticky
 * header the scroller starts below.
 *
 * `min-h`, not `h`: a panel whose content outgrows the viewport should get taller and scroll
 * rather than clip.
 */
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex min-h-[calc(100svh-4rem)] snap-start flex-col justify-center py-16">
      {children}
    </section>
  );
}

/**
 * The rolling list that stands in for the gap report.
 *
 * The window is a fixed height so the track has something to travel through, and the track holds
 * the list twice so there is no gap at the wrap. The second copy is hidden from assistive tech,
 * which reads the first and stops.
 */
function Roll({
  title,
  meta,
  children,
}: {
  title: string;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="report-ground flex flex-col gap-1 p-5">
      <div className="flex items-baseline justify-between gap-3 pb-1">
        <span className="font-mono text-sm text-ink">{title}</span>
        <span className="font-mono text-xs text-ink-faint">{meta}</span>
      </div>
      <div className="report-window h-[19rem] overflow-hidden">
        <div className="report-roll">
          {[0, 1].map((copy) => (
            <div key={copy} aria-hidden={copy === 1 ? true : undefined}>
              {children}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * A section as two columns over one instruction.
 *
 * The rule between the columns is an element with a mask rather than a border, because a border
 * takes a single flat colour and cannot fade out at its ends. It only exists from `lg`, where
 * there are two columns for it to separate.
 *
 * `isolate` keeps the negative z-index bloom from sliding behind the page background, and gives
 * the report's own wash something to sit inside.
 */
function Split({
  copy,
  visual,
  action,
}: {
  copy: React.ReactNode;
  visual: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-10">
      <div className="relative isolate grid items-center gap-10 lg:grid-cols-2 lg:gap-0">
        <span
          aria-hidden
          className="absolute -top-10 -left-12 -z-10 h-32 w-80 rounded-full bg-accent/20 blur-3xl"
        />
        <div className="flex flex-col items-start gap-5 lg:pr-14">{copy}</div>
        <span
          aria-hidden
          className="column-rule absolute inset-y-0 left-1/2 hidden w-px bg-line-strong lg:block"
        />
        <div className="lg:pl-14">{visual}</div>
      </div>
      {/* Under both columns rather than at the tail of the copy, so it reads as the section's one
          instruction rather than as the end of a paragraph. */}
      <div className="flex flex-col items-center gap-3">{action}</div>
    </div>
  );
}

const heading =
  "font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl";

/**
 * #devx, by channel id rather than by name, so renaming the channel does not break the link. That
 * is the trade for an id nobody can check by reading it. Slack hands off to the desktop app when
 * it is installed and falls back to the browser when it is not.
 */
const SLACK_CHANNEL = "https://korzaworkspace.slack.com/archives/C0BR0RQD0UC";

const RECENT_UPDATES = 3;

const updateDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/**
 * The argument for the whole portal, as one claim and the four reasons it holds.
 *
 * Nothing here is a feature. The panels above sell the two things the site does; this one says why
 * either is worth opening, which is the part a reader who has never heard of the portal is missing.
 */
const reasons = [
  {
    title: "Everyone solves it alone",
    body: "Fifty people solving the same problem produce fifty slightly different answers, and lose fifty afternoons doing it.",
  },
  {
    title: "Capturing got cheap",
    body: "AI collapsed the cost of reuse. A solution captured once becomes something anyone can pull in with one command.",
  },
  {
    title: "Your judgment is the scarce thing",
    body: "Nobody was hired to format documents or write boilerplate. Every hour on a solved problem is taken from the calls only you can make.",
  },
  {
    title: "Solved means proven",
    body: "Nothing lands here on vibes. Every skill is pinned to a version that was tried first, and the CI catalogue is synced from the pipelines it describes.",
  },
];

type Check = { label: string; evidence: string | null };

// Illustrative. Nothing on screen says so any more, so the repository it names has to be one that
// does not exist: a real name here would read as a published audit of somebody's project.
//
// Labels are read from the catalogue rather than written here, so the preview cannot name a check
// differently from the analysis that runs it.
const check = (id: CapabilityId, evidence: string | null): Check => ({
  label: capabilityLabel(id),
  evidence,
});

const exampleRun: Check[] = [
  check("secrets", "kingfisher.yml"),
  // TODO: not a capability in catalogue.json, so nothing checks for it. It has to reach the
  // baseline in shared-workflows before this row can claim otherwise.
  { label: "Commit Signing", evidence: null },
  check("sca", "trivy fs in ci.yml"),
  check("sast", null),
  check("image-scan", null),
  check("iac-dockerfile-lint", "hadolint in ci.yml"),
  check("lint-bugs", "eslint.config.js"),
  check("typecheck", "tsconfig.json"),
  check("unit-tests", "vitest in package.json"),
  check("coverage", null),
  check("e2e-tests", null),
];

const exampleMissing = exampleRun.filter((row) => row.evidence === null).length;

function CheckRow({ label, evidence }: Check) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line py-3">
      <span className="text-sm whitespace-nowrap text-ink">{label}</span>
      {evidence ? (
        <span className="truncate font-mono text-xs text-ink-faint">
          {evidence}
        </span>
      ) : (
        <span className="font-mono text-xs text-accent">missing</span>
      )}
    </div>
  );
}

function ReportPreview() {
  return (
    <Roll
      title="korza/kessel-run"
      meta={`${exampleMissing} of ${exampleRun.length} missing`}
    >
      {exampleRun.map((row) => (
        <CheckRow key={row.label} {...row} />
      ))}
    </Roll>
  );
}

/**
 * The pool the audience chips draw from, named rather than sliced off the front of the catalogue
 * so the row keeps its shape when the marketplace syncs and the order changes.
 *
 * Ordered as the unfiltered view, which is why it opens on four different audiences: those five
 * are what "Everyone" shows. Each chip then needs five of its own out of this pool, and the three
 * that follow are there to make Engineering and Business reach that on their own tags rather than
 * on the All rows.
 */
const featuredSkillIds = [
  "codezen:skills/brainstorm",
  "codezen:skills/code-review",
  "mattpocock-skills:skills/productivity/to-questionnaire",
  "mattpocock-skills:skills/engineering/triage",
  "mattpocock-skills:skills/productivity/handoff",
  "codezen:skills/security-review",
  "codezen:skills/tdd",
  "superpowers:skills/systematic-debugging",
  "mattpocock-skills:skills/engineering/to-tickets",
  "mattpocock-skills:skills/productivity/grilling",
  "humanizer:.",
  "superpowers:skills/writing-plans",
];

// Throws rather than filters, for the reason `capabilityLabel` does: a sync that retires one of
// these should fail the build, not quietly leave a chip a card short.
const featuredSkills: SkillCard[] = featuredSkillIds.map((id) => {
  const skill = skills.find((entry) => entry.id === id);
  if (!skill) {
    throw new Error(
      `The home page names skill "${id}", which the marketplace no longer publishes.`,
    );
  }
  // `jobs[0]` is already written as a job someone wants done, so the card title needs nothing
  // invented, only a capital.
  const job = skill.jobs[0];
  return {
    id: skill.id,
    title: job.charAt(0).toUpperCase() + job.slice(1),
    summary: skill.summary ?? skill.description,
    audiences: skill.audiences,
    provenance:
      skill.origin === "Korza"
        ? "Built at Korza"
        : skill.pinned
          ? `Pinned to ${skill.ref}`
          : `From ${skill.sourceRepo}`,
  };
});

const doorClass =
  "flex flex-col gap-2 rounded-2xl bg-surface p-6 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--ink)_10%,transparent),0_12px_32px_-14px_rgb(0_0_0/0.8)] transition-colors hover:bg-surface-raised";

/**
 * One of the three ways in on the closing panel. The whole card is the control rather than a link
 * at the bottom of it, so the arrow is a label for the card and not a second target inside it.
 */
function Door({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  action: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <p className="font-mono text-xs tracking-wide text-accent uppercase">
        {eyebrow}
      </p>
      <h3 className="font-display text-lg leading-snug font-semibold tracking-tight text-ink">
        {title}
      </h3>
      {children}
      <p className="mt-auto pt-5 text-sm font-medium text-accent">{action}</p>
    </>
  );
}

export default function Home() {
  const recent = getUpdates().slice(0, RECENT_UPDATES);

  return (
    /**
     * The document is the scroller, so there is exactly one of them: a scroll container here
     * meant the footer sat in the document behind it, and once the document had scrolled down
     * to show the footer the wheel went on driving the inner scroller, so nothing scrolled the
     * footer back off again.
     *
     * `-my-12` cancels the root layout's own padding: the panels measure themselves against the
     * viewport, so padding above the first one pushes it off the bottom of its own screen.
     */
    <div className="-my-12 flex flex-col">
      <SnapScroll />
      <DrawMarks />
      <Panel>
        <div className="flex max-w-3xl flex-col gap-5">
          <h1 className="font-display text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
            Never solve the same problem twice.
          </h1>
          <p className="text-xl leading-relaxed text-ink-muted">
            Korza&apos;s proven tools, skills, and ways of working. Captured
            once, tested, and ready for whatever you&apos;re doing today.
          </p>
          {/* The one door a new machine needs, and the only control on this screen. Everything
              below it assumes the toolchain is already there, so it goes above them rather than
              at the end of the scroll. The install itself is a long `sh -c` one-liner, which is
              why this links to the page that can present it properly instead of printing it. */}
          <div className="flex flex-col items-start gap-2.5 pt-2">
            <Link
              href="/getting-started"
              className="rounded-lg bg-surface-raised px-5 py-2.5 text-sm font-medium text-ink shadow-[inset_0_1px_0_color-mix(in_oklab,var(--ink)_16%,transparent)] transition-colors hover:bg-line"
            >
              Set up your machine →
            </Link>
            <p className="text-sm text-ink-faint">
              One command installs the Korza CLI. It sets up the toolchain and
              the skills from there.
            </p>
          </div>
        </div>
      </Panel>

      <Panel>
        {/* No card and no section heading: the lead sentence is the heading. */}
        <Split
          copy={
            <>
              <h2 className={heading}>
                Standardise how you work, starting with the CI pipelines.
              </h2>
              <p className="leading-relaxed text-ink-muted">
                The catalogue is the set of checks worth running in CI, and the
                baseline each stack should meet. Keep every project consistent
                and every delivery up to standard.
              </p>
              <Link
                href="/tools"
                className="text-sm font-medium text-accent hover:underline"
              >
                Browse the catalogue →
              </Link>
            </>
          }
          visual={<ReportPreview />}
          action={
            <>
              <p className="text-center text-sm text-ink-muted">
                See where yours falls short and fix it before it reaches a
                client.
              </p>
              {/* A plain GET form, so the field works before any JavaScript loads. The report
                  page reads `repo` from the query string and runs the analysis on arrival.

                  On a raised plate, because the field is the one thing on this panel a reader is
                  meant to touch and a bordered box on the canvas was reading as part of the
                  background. The plate lifts the pair off the page and the field sits recessed
                  inside it, which is the affordance the border alone was not carrying. */}
              <form
                action="/ci-coverage"
                className="field-plate flex w-full max-w-xl flex-col gap-2 rounded-2xl bg-surface p-2 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--ink)_10%,transparent),0_16px_40px_-16px_rgb(0_0_0/0.9)] sm:flex-row"
              >
                {/* `required` rather than a disabled button, which would need this to be a
                    client component and would leave the empty submit working until the JS
                    arrived. The pattern is only "contains something that is not a space":
                    anything stricter would reject the full URLs that parseRepoRef accepts. */}
                <input
                  name="repo"
                  placeholder="owner/repo"
                  aria-label="Repository to analyze"
                  required
                  pattern=".*\S.*"
                  title="A GitHub repository, as owner/repo or a full github.com URL."
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-xl border border-line bg-canvas px-4 py-3 font-mono text-base text-ink placeholder:text-ink-faint"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-surface-raised px-6 py-3 text-base font-medium whitespace-nowrap text-ink shadow-[inset_0_1px_0_color-mix(in_oklab,var(--ink)_16%,transparent)] transition-colors hover:bg-line"
                >
                  Analyze
                </button>
              </form>
            </>
          }
        />
      </Panel>

      {/* No split and no rule down the middle, unlike the section above: the cards are the whole
          width of the panel, so the copy sits over them rather than beside them. */}
      <Panel>
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-5">
            <h2 className={heading}>
              Supercharge your work with specialised{" "}
              <span className="mark">skills</span> when working with your AI
              agents.
            </h2>
            <p className="max-w-3xl leading-relaxed text-ink-muted">
              Stop repeating yourself to your agents, and let a curated skill
              take care of it. Each one is written for a job someone at Korza
              had already solved, kept to the format your team expects, and
              tested before it reaches you.
            </p>
          </div>
          <SkillPicker cards={featuredSkills} />
        </div>
      </Panel>

      {/* The argument, and deliberately the one panel with nothing to click: everywhere it could
          send you is already a door on a panel either side of it. */}
      <Panel>
        <div className="flex flex-col gap-14">
          <p className="max-w-3xl font-display text-3xl leading-snug font-semibold tracking-tight text-balance sm:text-4xl">
            Most work is re-work. Someone has already optimised a way to write
            that plan, that config, that deck. So take it, and spend your time
            on the problems <span className="mark">worth the effort</span>.
          </p>
          <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {reasons.map((reason) => (
              <div key={reason.title} className="flex flex-col gap-2">
                <h2 className="font-display leading-snug font-semibold text-ink">
                  {reason.title}
                </h2>
                <p className="text-sm leading-relaxed text-ink-muted">
                  {reason.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      {/* The last panel before the footer, and the only one that asks for something back. The
          three doors are ordered by how much they ask of the reader: read what changed, vote on
          what is coming, then say a thing of your own. */}
      <Panel>
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-5">
            <h2 className={heading}>
              Bring us <span className="mark">your ideas</span>. We are here to
              help you do your best work.
            </h2>
            <p className="max-w-3xl leading-relaxed text-ink-muted">
              This portal is early and it is built in the open. The most useful
              thing you can hand it is a problem you have already solved twice,
              or one you keep hitting and nobody has picked up yet.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link href="/updates" className={doorClass}>
              <Door
                eyebrow="Updates"
                title="See what has changed"
                action="Read all updates →"
              >
                {/* The three newest entries, read from content/updates at build time, so this
                    stops being true only if nobody writes an update. */}
                <ul className="flex flex-col gap-1.5 pt-1">
                  {recent.map((entry) => (
                    <li key={entry.slug} className="flex gap-2 text-sm">
                      {/* The date column is fixed so the titles start on one edge, and the title
                          wraps rather than truncating: cut short, these read as fragments. */}
                      <span className="w-11 shrink-0 pt-0.5 font-mono text-xs text-ink-faint">
                        {updateDate.format(new Date(entry.date))}
                      </span>
                      <span className="min-w-0 leading-snug text-ink-muted">
                        {entry.title}
                      </span>
                    </li>
                  ))}
                </ul>
              </Door>
            </Link>

            <Link href="/roadmap" className={doorClass}>
              <Door
                eyebrow="Roadmap"
                title="Decide what comes next"
                action="Open the roadmap →"
              >
                <p className="text-sm leading-relaxed text-ink-muted">
                  Everything being considered is listed, and every item takes a
                  vote and a comment. Back the ones you need. Saying plainly
                  that something is missing is worth more than a vote.
                </p>
              </Door>
            </Link>

            {/* An anchor rather than Link: it leaves the site, so there is nothing to prefetch. */}
            <a href={SLACK_CHANNEL} className={doorClass}>
              <Door
                eyebrow="Slack"
                title="Talk to the DevX team"
                action="Join the channel →"
              >
                <p className="text-sm leading-relaxed text-ink-muted">
                  The fastest way to reach us. Ask a question, or bring
                  something your team has worked out, and we will look at
                  turning it into a skill everyone gets.
                </p>
              </Door>
            </a>
          </div>
        </div>
      </Panel>
    </div>
  );
}
