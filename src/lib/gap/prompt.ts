import type { Analysis, CapabilityReport, RecommendedTool } from "./types";

// The brief a coding agent gets handed, built from the report and nothing else. It is a brief
// rather than a recipe on purpose: `analyze` refuses to emit a workflow snippet it has not run,
// and the same reasoning applies here. What the portal knows is which checks are missing and what
// the catalogue would put there. Exclude paths, trigger events and monorepo layout are the
// agent's to work out, because it has the repo and the portal read at most a couple of dozen files.
//
// TODO(DX-103): revisit when the real CI catalogue lands. Install commands, docs URLs and any
// required-vs-recommended distinction would all belong in here, and none of them exist yet.

type Gap = CapabilityReport & { category: string };

// Labels and tool names come from the catalogue, but evidence strings carry a repo path and paths
// are the repo's to name. A pipe would end the table row early and a backtick would close the code
// span the value sits in.
function cell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("`", "'");
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

function suggestion(gap: Gap): string {
  if (gap.recommended.length === 0)
    return "no tool in the catalogue for this stack";

  const disjunction = isDisjunction(gap.recommended);
  const showAttribution =
    !disjunction &&
    (gap.present.length > 0 ||
      gap.recommended.length > 1 ||
      gap.recommended.some((tool) => tool.stackLabels.length > 1));

  const formatter = disjunction ? alternatives : requirements;
  return formatter.format(
    gap.recommended.map((tool) =>
      showAttribution && tool.stackLabels.length > 0
        ? `${cell(tool.name)} for ${requirements.format(tool.stackLabels)}`
        : cell(tool.name),
    ),
  );
}

export function buildFixPrompt(analysis: Analysis): string {
  const expected = analysis.satisfiedCount + analysis.gapCount;

  const running = analysis.categories.flatMap((category) =>
    category.capabilities.filter((capability) => capability.satisfied),
  );

  const gaps: Gap[] = analysis.categories.flatMap((category) =>
    category.capabilities
      .filter((capability) => !capability.satisfied)
      .map((capability) => ({ ...capability, category: category.category })),
  );

  const stacks =
    analysis.stacks.length > 0
      ? analysis.stacks.map((stack) => stack.label).join(", ")
      : "none, no manifest was recognised at the repo root";

  // A repo with nothing detected is the case this whole feature exists for, so none of these
  // sections can assume it has rows. A markdown table with a header and no body reads as a
  // rendering failure rather than as an empty set.
  const filesRead =
    analysis.filesRead.length > 0
      ? `It read these files and nothing else:\n\n${analysis.filesRead
          .map((path) => `- ${cell(path)}`)
          .join("\n")}`
      : "It found no manifest and no CI config worth reading, so everything below rests on the list of tracked paths alone.";

  const runningRows = running.flatMap((capability) =>
    capability.present.map(
      (tool) =>
        `| ${cell(capability.label)} | ${cell(tool.name)} | \`${cell(tool.evidence)}\` |`,
    ),
  );

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

  return `# Fix the CI pipeline in ${analysis.repo}

You are working in the repo this file was pasted into. A CI gap report was produced by the Korza
DevX portal and is reproduced below. Your job is to close the gaps it lists.

## How the report was made, and what it does not know

The portal read the default branch over the GitHub API. ${filesRead}

It never ran anything, and it never saw repo history, required status checks, branch protection,
org rulesets or self-hosted runner config. It saw no branch other than \`${analysis.defaultBranch}\`.
Detection is signal matching, so it can miss a check that runs through an indirection it does not
recognise.

You have the whole repo. Where the report and the repo disagree, the repo wins.

## What the report found

Repo: ${analysis.repo}
Default branch: ${analysis.defaultBranch}
Stacks detected: ${stacks}
Score: ${analysis.satisfiedCount} of ${expected} recommended checks are running.

### Already running, do not duplicate

${runningTable}

### Missing, in the order to work through them

${gapTable}

Where a row names more than one tool, its own wording says whether they are alternatives (pick
one) or each required for a different part of the repo (install every one named).

The tool column is a suggestion from a catalogue, not a decision. If the repo already has a house
tool for the same job, use that one and say so.

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
the new checks surfaced and what you did with it.
`;
}
