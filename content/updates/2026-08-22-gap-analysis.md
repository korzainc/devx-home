---
date: 2026-08-22
title: Gap analysis tells you what your CI is missing
---

Paste a repo into [gap analysis](/gap-analysis) and you get back the checks it
should be running and is not, in about two seconds.

### Try it on something you own

Give it `owner/repo` or a full GitHub URL. It reads the repo through the API and
never clones, so there is nothing to install and nothing to configure first.

The repo is part of the URL, so `/gap-analysis?repo=owner/name` is a link you can
drop into a ticket or a PR review, and it runs when someone opens it.

### It shows its work

Every check it finds names the file it came from, like `Trivy` on
`uses: aquasecurity/trivy-action`. When it says something is missing, it links
the tools in the catalogue that would cover it. So you can disagree with a
result and go check it, instead of taking the report on trust.

### How it decides

It works out your stack from the root manifests, then compares what runs against
what the catalogue expects for that stack. A check counts as present on any one
signal: an action in `uses:`, a program in a `run:` step or a package script, a
config file in the tree, a dependency in a manifest.

There is no model in the path, so the same repo gives the same answer every
time. A run reads one tree listing plus the root manifests and CI config, capped
at twenty files. On this repo that is four files.

### Where it stops

It will not write the workflow for you. A generated snippet that has never run
against your repo is a guess, and you would have to review it line by line
anyway.

Detection only sees what is committed, so a pipeline configured somewhere else
reads as missing. And the tool list behind it is still placeholder data, so read
the recommendations as a shape rather than Korza policy.
