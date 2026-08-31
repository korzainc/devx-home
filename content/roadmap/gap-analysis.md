---
title: Gap analysis for GitHub Actions
stage: shipped
category: gap analysis
landed: 2026-08
summary:
  Paste a repo name and see which recommended checks are running, with the file
  that proves each one.
---

Live on the home page. The [updates entry](/updates) says how to read the
report.

How it reads your repo is real: it finds the workflow files, matches what they
run, and names the file that proves each check. What it measures you against is
not yet. The baselines come from the
[tools catalogue](/roadmap/tools-catalogue), which is still placeholder data.
