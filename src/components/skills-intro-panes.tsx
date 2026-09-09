import Link from "next/link";
import { SkillsGlossaryLine } from "@/components/skills-glossary-line";

type Pane = {
  eyebrow: string;
  heading: string;
  body: string;
  /** Two lines, always. A third would push this pane's box below its neighbours'. */
  demo: [React.ReactNode, React.ReactNode];
};

/**
 * Each body is written to three lines at the width a pane gets on a desktop viewport. Nothing
 * enforces that, so a longer sentence here simply reads denser; the subgrid keeps the boxes
 * aligned either way.
 */
const PANES: Pane[] = [
  {
    eyebrow: "What it is",
    heading: "A procedure, not a prompt",
    body: "A written procedure your agent loads on demand: the steps, the order, and what your team never skips.",
    demo: [
      <span key="cmd" className="text-accent">
        /brainstorm
      </span>,
      <span key="what">a vague ask → an agreed brief</span>,
    ],
  },
  {
    /* The fact that surprises everyone, and the reason the old "why" pane was replaced: a
       reader who thinks skills must be typed never benefits from the ones that self-load. */
    eyebrow: "How it fires",
    heading: "Usually without being asked",
    body: "Some you type. Most declare the job they do and load themselves the moment your agent hits it, unprompted.",
    demo: [
      <span key="typed">
        you type <span className="text-accent">/brainstorm</span> → called
      </span>,
      <span key="auto">
        agent files an issue → <span className="text-ink-muted">to-issue</span>{" "}
        fires
      </span>,
    ],
  },
  {
    eyebrow: "How to get one",
    heading: "Skills ship inside plugins",
    body: "You install the plugin and every skill inside it comes along. That is why this catalogue lists plugins first.",
    demo: [
      <span key="plugin">
        plugin <span className="text-ink-muted">codezen</span> → its whole set
      </span>,
      <span key="once">one install, all of them</span>,
    ],
  },
];

export function SkillsIntroPanes() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-balance">
          Three things, then you&rsquo;re done
        </h1>
        <p className="max-w-2xl leading-relaxed text-ink-muted">
          A skill is a procedure your agent loads when the job matches. Here is
          what that buys you, and how to get one.
        </p>
      </div>

      {/* Subgrid: the parent owns the four row tracks, so the eyebrow, heading, body and demo
          box line up across all three panes however the copy wraps. Capping the body at a line
          count instead broke the moment one pane wrapped to an extra line. */}
      <div className="grid gap-4 lg:grid-rows-[auto_auto_1fr_auto] lg:grid-cols-3">
        {PANES.map((pane) => (
          <article
            key={pane.heading}
            className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 lg:row-span-4 lg:grid lg:grid-rows-subgrid"
          >
            <span className="font-mono text-[0.65rem] tracking-wider text-accent uppercase">
              {pane.eyebrow}
            </span>
            <h2 className="text-lg font-semibold tracking-tight text-balance">
              {pane.heading}
            </h2>
            <p className="leading-relaxed text-ink-muted">{pane.body}</p>
            <div className="flex flex-col justify-center gap-1 rounded-lg border border-line bg-canvas px-3.5 py-3 font-mono text-xs leading-[1.7] text-ink-faint">
              {pane.demo[0]}
              {pane.demo[1]}
            </div>
          </article>
        ))}
      </div>

      {/* Centred, so the pair reads as one choice under the three panes. */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/skills-intro/demo"
          className="rounded-lg border border-line-strong bg-accent-wash px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-accent"
        >
          See one run
        </Link>
        <Link
          href="/skills"
          className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:border-line-strong"
        >
          Browse the catalogue
        </Link>
      </div>
    </div>
  );
}

/**
 * All three terms, under a rule at the foot of the intro page. The chain itself lives in
 * SkillsGlossaryLine, so this and the catalogue header cannot drift apart; this page has the
 * room to name the marketplace, which that header does not.
 */
export function SkillsGlossaryNote() {
  return (
    <SkillsGlossaryLine
      className="justify-center border-t border-line pt-5 text-sm text-ink-muted"
      terms={[
        ["marketplace", "the app store"],
        ["plugin", "the thing you install"],
        ["skill", "what does the work"],
      ]}
    />
  );
}
