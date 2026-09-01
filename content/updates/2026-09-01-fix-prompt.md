---
date: 2026-09-01
title: Turn a gap report into a prompt for your coding agent
---

A [gap report](/gap-analysis) now has a Generate fix prompt button next to the
score. It writes a brief listing the checks you are missing, the tools that would
cover each one, and what is already running so nothing gets added twice.

Copy it, open your repository in a coding agent, and paste.

The brief is not a workflow file. Nothing in it has been run against your code, so
exclude paths, triggers and build layout are left to the agent to work out from
the repository, and it is told to trust the repository wherever the two disagree.

Where a check lists more than one tool, any one of them covers it.
