import Link from "next/link";
import { PreviewInstallCommand } from "@/components/preview-install";
import { SnapScroll } from "@/components/snap-scroll";
import {
  capabilityLabel,
  marketplaceName,
  skills,
  type CapabilityId,
  type SkillEntry,
} from "@/lib/catalogue";

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
 * The rolling list that stands in for a product surface in each section.
 *
 * The window is a fixed height so the track has something to travel through, and the track holds
 * the list twice so there is no gap at the wrap. The second copy is hidden from assistive tech,
 * which reads the first and stops.
 *
 * `seconds` is per caller rather than fixed, because the two lists have different row heights and
 * one duration would make the taller one travel twice as fast.
 */
function Roll({
  eyebrow,
  title,
  meta,
  seconds,
  children,
}: {
  eyebrow: string;
  title: string;
  meta: string;
  seconds: number;
  children: React.ReactNode;
}) {
  return (
    <div className="report-ground flex flex-col gap-1 p-5">
      <p className="font-mono text-[0.65rem] tracking-wide text-ink-faint uppercase">
        {eyebrow}
      </p>
      <div className="flex items-baseline justify-between gap-3 pb-1">
        <span className="font-mono text-sm text-ink">{title}</span>
        <span className="font-mono text-xs text-ink-faint">{meta}</span>
      </div>
      <div className="report-window h-[19rem] overflow-hidden">
        <div
          className="report-roll"
          style={{ animationDuration: `${seconds}s` }}
        >
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

type Check = { label: string; evidence: string | null };

// Illustrative, and labelled as such on screen. Labels are read from the catalogue rather than
// written here, so the preview cannot name a check differently from the analysis that runs it.
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
      eyebrow="Example run"
      title="your-org/service-api"
      meta={`${exampleMissing} of ${exampleRun.length} missing`}
      seconds={28}
    >
      {exampleRun.map((row) => (
        <CheckRow key={row.label} {...row} />
      ))}
    </Roll>
  );
}

// Named rather than sliced off the front of the catalogue, so the preview keeps its spread across
// audiences when the marketplace syncs and the order changes. Chosen to show that the work either
// side of code is covered too: three of these carry no engineering audience at all.
const previewSkillIds = [
  "superpowers:skills/brainstorming",
  "mattpocock-skills:skills/engineering/to-spec",
  "mattpocock-skills:skills/productivity/grilling",
  "mattpocock-skills:skills/productivity/to-questionnaire",
  "superpowers:skills/test-driven-development",
  "codezen:skills/code-review",
  "mattpocock-skills:skills/engineering/diagnosing-bugs",
  "mattpocock-skills:skills/engineering/to-tickets",
  "humanizer:.",
  "mattpocock-skills:skills/productivity/handoff",
  "mattpocock-skills:skills/engineering/research",
  "mattpocock-skills:skills/productivity/wait-what",
];

// Throws rather than filters, for the reason `capabilityLabel` does: a sync that retires one of
// these should fail the build, not quietly show eleven rows.
const previewSkills = previewSkillIds.map((id) => {
  const skill = skills.find((entry) => entry.id === id);
  if (!skill) {
    throw new Error(
      `The home page names skill "${id}", which the marketplace no longer publishes.`,
    );
  }
  return skill;
});

const installCommand = `/plugin install codezen@${marketplaceName}`;

// Takes only the fields it draws, rather than the whole entry: a `SkillEntry` also carries `ref`,
// the git ref the skill is pinned to, and spreading that in hands React a real ref.
function SkillRow({
  name,
  summary,
  description,
  audiences,
}: Pick<SkillEntry, "name" | "summary" | "description" | "audiences">) {
  return (
    <div className="border-t border-line py-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-mono text-sm whitespace-nowrap text-ink">
          {name}
        </span>
        <span className="truncate font-mono text-xs text-ink-faint">
          {audiences.join(", ")}
        </span>
      </div>
      <p className="pt-1 text-xs text-ink-muted">{summary ?? description}</p>
    </div>
  );
}

function SkillsPreview() {
  return (
    <Roll
      eyebrow="Marketplace"
      title={marketplaceName}
      meta={`${skills.length} skills`}
      seconds={46}
    >
      {previewSkills.map((skill) => (
        <SkillRow
          key={skill.id}
          name={skill.name}
          summary={skill.summary}
          description={skill.description}
          audiences={skill.audiences}
        />
      ))}
    </Roll>
  );
}

export default function Home() {
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
                  page reads `repo` from the query string and runs the analysis on arrival. */}
              <form
                action="/ci-coverage"
                className="flex w-full max-w-md flex-col gap-2 sm:flex-row"
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
                  className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-surface-raised px-4 py-2 text-sm font-medium whitespace-nowrap text-ink shadow-[inset_0_1px_0_color-mix(in_oklab,var(--ink)_16%,transparent)] transition-colors hover:bg-line"
                >
                  Analyze
                </button>
              </form>
            </>
          }
        />
      </Panel>

      <Panel>
        <Split
          copy={
            <>
              {/* Opens on "And", so the section reads as the second half of the one above
                  rather than as a pitch of its own. */}
              <h2 className={heading}>
                And when you&apos;re working with AI agents.
              </h2>
              <p className="leading-relaxed text-ink-muted">
                Every prompt you write twice is a skill you have not installed
                yet. Skills for engineers, and for everyone whose work reaches
                them: shaping a vague request into a spec, pressure-testing a
                decision before you commit, handing work over so it can be
                picked up.
              </p>
              <Link
                href="/skills"
                className="text-sm font-medium text-accent hover:underline"
              >
                Browse the marketplace →
              </Link>
            </>
          }
          visual={<SkillsPreview />}
          action={
            <>
              <p className="text-center text-sm text-ink-muted">
                Stop repeating yourself, and let a curated skill take care of
                it.
              </p>
              {/* The counterpart to the analyze field above: the section's instruction, and the
                  command that carries it out. */}
              <div className="w-full max-w-md">
                <PreviewInstallCommand command={installCommand} />
              </div>
            </>
          }
        />
      </Panel>
    </div>
  );
}
