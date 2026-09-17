import type { Analysis, CapabilityReport, RecommendedTool } from "./types";

// The brief a coding agent gets handed, built from the report and nothing else. It is a brief
// rather than a recipe on purpose: `analyze` refuses to emit a workflow snippet it has not run,
// and the same reasoning applies here. What the portal knows is which checks are missing and what
// the catalogue would put there. Exclude paths, trigger events and monorepo layout are the
// agent's to work out, because it has the repo and the portal read at most a couple of dozen files.
//
// TODO(DX-103): the real catalogue now carries install commands, docs URLs and (DX-62) a
// mandatory-vs-recommended distinction; none of that has been threaded into this brief yet.

type Gap = CapabilityReport & { category: string };

/** Per-capability placement fact, standing in for a real detector this round (DX-198 demo).
 * Hand-typed by the caller, never repo-derived - buildFixPrompt renders both fields unescaped.
 * A future detector supplying `candidate` from repo content would need to escape it the same
 * way evidence strings elsewhere in this file are escaped, or a crafted CI step could inject
 * markdown into a document a coding agent treats as ground truth. */
export type Placement = {
  /** What must exist first, phrased for the brief: "a built container image to scan". */
  needs: string;
  /** Where it might already happen, phrased as evidence to verify. Null when nothing found. */
  candidate: string | null;
};

/** Keyed by capability id. Empty/omitted renders no new section (see buildFixPrompt). */
export type PlacementNotes = Record<string, Placement>;

// Evidence strings carry repo-controlled paths and, via a quoted YAML scalar in a workflow
// file, can carry a real newline. A pipe would end the table row early, a backtick would close
// the code span the value sits in, and an unescaped newline would let the rest write fresh
// markdown into a document a coding agent treats as ground truth.
//
// Backslash goes first: escaping "|" without it first turns a literal "a\|b" into "a\\|b",
// which GFM reads as an escaped backslash followed by a live, row-ending pipe.
function cell(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|")
    .replaceAll("`", "'")
    .replaceAll(/\r\n|\r|\n/g, " ");
}

// `or` rather than commas, because the tools in a row are alternatives and an agent handed a
// comma-separated list will reach for all of them. en-GB keeps the Oxford comma out of it.
// Exported because the report renders the same list as links, and the two must not drift.
export const alternatives = new Intl.ListFormat("en-GB", {
  style: "long",
  type: "disjunction",
});

// `and` for a row where every tool is required, not a choice - the counterpart to
// `alternatives` above. Exported for the same reason: the report renders the same list and
// must not drift on the wording.
export const requirements = new Intl.ListFormat("en-GB", {
  style: "long",
  type: "conjunction",
});

/** True when every entry is a genuine alternative (not tied to a stack) - shared with
 * gap-report.tsx so the two can't independently drift on what counts as one. */
export function isDisjunction(tools: RecommendedTool[]): boolean {
  return tools.every((tool) => tool.stackLabels.length === 0);
}

/** True when the outer tool list and an inner per-tool stack list would both use "and",
 * colliding into a run-on ("X for A and B and Y for C"). Shared with gap-report.tsx so the
 * two pick the same outer joiner. */
export function needsClauses(tools: RecommendedTool[]): boolean {
  return tools.length > 1 && tools.some((tool) => tool.stackLabels.length > 1);
}

/** True when attribution should show even for a single entry - shared with gap-report.tsx so
 * the two can't independently drift on when to attribute. `alwaysAttribute` covers a partially
 * covered capability, where a lone remaining tool still needs its stack named explicitly. */
export function showAttribution(
  tools: RecommendedTool[],
  alwaysAttribute = false,
): boolean {
  return (
    alwaysAttribute ||
    tools.length > 1 ||
    tools.some((tool) => tool.stackLabels.length > 1)
  );
}

/** Semicolon-joined clauses, for when `requirements`'s "and" would collide with an inner
 * per-tool stack list's own "and". `Intl.ListFormat` has no semicolon type, so this mirrors
 * its two-method shape by hand. Exported for the same reason as `alternatives`. */
export const clauses = {
  format(items: string[]): string {
    if (items.length <= 1) return items.join("");
    const last = items[items.length - 1];
    return `${items.slice(0, -1).join("; ")}; and ${last}`;
  },
  formatToParts(
    items: string[],
  ): { type: "literal" | "element"; value: string }[] {
    return items.flatMap((item, index) => {
      const literal =
        index === 0
          ? []
          : [
              {
                type: "literal" as const,
                value: index === items.length - 1 ? "; and " : "; ",
              },
            ];
      return [...literal, { type: "element" as const, value: item }];
    });
  },
};

/** The " for A and B" a tool's name earns when attribution is on and it names a stack, or ""
 * otherwise. Shared with gap-report.tsx so the running list, the partial list, and the gap
 * table can't independently drift on how a tool's stack gets named. Returns plain text, not a
 * table cell - `attributedName` below applies `cell()` for the markdown table this file builds. */
export function attributionSuffix(
  tool: { stackLabels: string[] },
  attribute: boolean,
): string {
  return attribute && tool.stackLabels.length > 0
    ? ` for ${requirements.format(tool.stackLabels)}`
    : "";
}

function attributedName(
  tool: { name: string; stackLabels: string[] },
  attribute: boolean,
): string {
  return `${cell(tool.name)}${cell(attributionSuffix(tool, attribute))}`;
}

function suggestion(gap: Gap): string {
  if (gap.recommended.length === 0)
    return "no tool in the catalogue for this stack";

  const disjunction = isDisjunction(gap.recommended);
  const attribute = showAttribution(gap.recommended, gap.present.length > 0);

  const formatter = disjunction
    ? alternatives
    : needsClauses(gap.recommended)
      ? clauses
      : requirements;
  return formatter.format(
    gap.recommended.map((tool) => attributedName(tool, attribute)),
  );
}

export function buildFixPrompt(
  analysis: Analysis,
  notes: PlacementNotes = {},
): string {
  const expected = analysis.satisfiedCount + analysis.gapCount;

  const running = analysis.categories.flatMap((category) =>
    category.capabilities.filter((capability) => capability.present.length > 0),
  );

  const gaps: Gap[] = analysis.categories.flatMap((category) =>
    category.capabilities
      .filter((capability) => !capability.satisfied)
      .map((capability) => ({ ...capability, category: category.category })),
  );

  const stacks =
    analysis.stacks.length > 0
      ? analysis.stacks.map((stack) => stack.label).join(", ")
      : "none, no manifest in the repository was recognised";

  // A repo with nothing detected is the case this whole feature exists for, so none of these
  // sections can assume it has rows. A markdown table with a header and no body reads as a
  // rendering failure rather than as an empty set.
  const filesRead =
    analysis.filesRead.length > 0
      ? `It read these files and nothing else:\n\n${analysis.filesRead
          .map((path) => `- \`${cell(path)}\``)
          .join("\n")}`
      : "It found no manifest and no CI config worth reading, so everything below rests on the list of tracked paths alone.";

  const runningRows = running.flatMap((capability) => {
    // A partial capability's present tool covers only part of the requirement, the same reason
    // the gap table names a lone remaining tool's stack even when attribute would otherwise stay
    // off.
    const attribute = showAttribution(
      capability.present,
      !capability.satisfied,
    );
    return capability.present.map(
      (tool) =>
        `| ${cell(capability.label)} | ${attributedName(tool, attribute)} | \`${cell(tool.evidence)}\` |`,
    );
  });

  const runningTable =
    runningRows.length > 0
      ? `| Check | Tool | Found via |\n| --- | --- | --- |\n${runningRows.join("\n")}`
      : "Nothing was detected, so there is nothing here to avoid duplicating.";

  const gapRows = gaps.map(
    (gap, index) =>
      `| ${index + 1} | ${cell(gap.label)} | ${cell(gap.category)} | ${suggestion(gap)} |`,
  );

  const gapTable =
    gapRows.length > 0
      ? `| # | Check | Category | Tools that would cover it |\n| --- | --- | --- | --- |\n${gapRows.join("\n")}`
      : "Nothing. Every check the baseline expects is already running.";

  // notes.needs/notes.candidate skip cell() - cell() is a table-cell escaper (rewrites backtick
  // to ' and pipe to \|), which would mangle a candidate string's own backticks. Only gap.label
  // goes through cell(), matching every other catalogue-sourced label in this file. Safe only
  // because Placement is hand-typed for this demo (see its doc comment) - a real detector-fed
  // candidate would be repo-controlled content and need the same escaping evidence strings get.
  //
  // note.needs is a phrase like "a built container image to scan" or "installed dependencies
  // to scan" - both paragraphs below reference it generically ("produces it") rather than
  // assuming image-scan's specific vocabulary, so this works for any capability with a
  // placement note, not just the one this round happens to test most.
  const placementParagraphs = gaps.flatMap((gap) => {
    const note = notes[gap.id];
    if (!note) return [];
    const label = cell(gap.label);
    return [
      note.candidate
        ? `**${label}** needs ${note.needs}. A candidate: ${note.candidate}. Verify that ` +
          `candidate really produces it before relying on it, then add the check to that ` +
          `same job, after that step. Not a new job: a new job gets a fresh runner without it.`
        : `**${label}** needs ${note.needs}. Nothing in the files the portal read produces ` +
          `it. Search the repo before accepting that, since it may happen somewhere the ` +
          `portal could not see. If there is genuinely nothing that produces it in CI, that ` +
          `has to be added first, ahead of the check, in the same job. If this repo has no ` +
          `real need for it at all, skip the check and say so.`,
    ];
  });

  // Renders nothing when there is nothing to say - a repo with no notes gets no new section.
  const placementSection =
    placementParagraphs.length > 0
      ? `\n### Where these go in the pipeline\n\nSome checks cannot stand alone. They need ` +
        `something else to have already run, in the same job.\n\n${placementParagraphs.join("\n\n")}\n`
      : "";

  const placementClosingLine =
    placementParagraphs.length > 0
      ? `\n\nFor a check named in the 'Where these go in the pipeline' section, name the job it ` +
        `went into and the step it now runs after.`
      : "";

  // A git ref permits both backticks and pipes, which is why this goes through the same escape
  // as every repo-controlled string here rather than being trusted as GitHub API output.
  const defaultBranch = cell(analysis.defaultBranch);

  return `# Fix the CI pipeline in ${analysis.repo}

You are working in the repo this file was pasted into. A CI gap report was produced by the Korza
DevX portal and is reproduced below. Your job is to close the gaps it lists.

## How the report was made, and what it does not know

The portal read the default branch over the GitHub API. ${filesRead}

It never ran anything, and it never saw repo history, required status checks, branch protection,
org rulesets or self-hosted runner config. It saw no branch other than \`${defaultBranch}\`.
Detection is signal matching, so it can miss a check that runs through an indirection it does not
recognise.

You have the whole repo. Where the report and the repo disagree, the repo wins.

## What the report found

Repo: ${analysis.repo}
Default branch: \`${defaultBranch}\`
Stacks detected: ${stacks}
Score: ${analysis.satisfiedCount} of ${expected} recommended checks are running${
    analysis.partialCount > 0
      ? `, plus ${analysis.partialCount} partially covered`
      : ""
  }.

### Already running, do not duplicate

${runningTable}

### Missing checks

${gapTable}

Where a row names more than one tool, its own wording says whether they are alternatives (pick
one) or each required for a different part of the repo (install every one named).

The tool column is a suggestion from a catalogue, not a decision. If the repo already has a house
tool for the same job, use that one and say so.
${placementSection}
## Rules of engagement

**Verify before you build.** For each gap, search the repo first. If the check already runs
somewhere the portal could not see, do not add a second one. Record it as a false positive in your
final summary instead.

**Find the configuration, do not assume it.** The report knows nothing about this repo's layout.
Before configuring a tool, work out what it needs here and justify each choice:

- Which paths to scan and which to exclude. Fixtures, vendored code, generated clients, snapshots
  and test data with sample credentials are the usual causes of a noisy first run.
- The package manager, lockfile and language versions actually in use.
- Whether this is a monorepo, and if so which workspaces the check applies to.
- Which events should trigger it: pull request, push to the default branch, tag, schedule.

Do not copy a tool's quickstart config verbatim.

**Prefer editing the existing workflows.** Add jobs where they belong. Create a new workflow file
only when the trigger genuinely differs, for example a scheduled scan or a tag-triggered job, and
say why in the pull request description.

**Run each check locally before committing it.** A check that has never been run against this repo
is a guess. If a tool cannot run locally, say so rather than claiming it passes.

**Expect the first run to be noisy.** Secret scanners and static analysis will flag things on an
existing codebase. Triage the findings. Real findings get reported to a human and are not silently
suppressed. False positives get a narrowly scoped ignore rule with a comment explaining it. Never
add a blanket ignore to make a run go green.

**One commit per check** so review can happen per check, and one pull request for the set.

## Stop and ask before

- Committing anything that would make the pipeline fail on existing code without a human deciding
  that is wanted.
- Adding a paid service, a new required status check, or anything needing a secret you cannot see.
- Changing branch protection or release workflows.

## When you are done

Report a table of every check above with one of: added, already present, skipped. For added, name
the file and the config decisions you made. For skipped, say what blocked it. List every finding
the new checks surfaced and what you did with it.${placementClosingLine}
`;
}
