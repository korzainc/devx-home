# Fix the CI pipeline in korzainc/bare

You are working in the repo this file was pasted into. A CI gap report was produced by the Korza
DevX portal and is reproduced below. Your job is to close the gaps it lists.

## How the report was made, and what it does not know

The portal read the default branch over the GitHub API. It found no manifest and no CI config worth reading, so everything below rests on the list of tracked paths alone.

It never ran anything, and it never saw repo history, required status checks, branch protection,
org rulesets or self-hosted runner config. It saw no branch other than `main`.
Detection is signal matching, so it can miss a check that runs through an indirection it does not
recognise.

You have the whole repo. Where the report and the repo disagree, the repo wins.

## What the report found

Repo: korzainc/bare
Default branch: `main`
Stacks detected: none, no manifest in the repository was recognised
Score: 0 of 0 recommended checks are running.

### Already running, do not duplicate

Nothing was detected, so there is nothing here to avoid duplicating.

### Missing, in the order to work through them

Nothing. Every check the baseline expects is already running.

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
