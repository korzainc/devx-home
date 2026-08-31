---
title: Say which gaps you have to fix
stage: exploring
category: gap analysis
outcome: Know which gap to fix first
summary:
  Every gap in a report reads the same, so a missing secret scan looks no more
  urgent than missing coverage.
question: Is a label enough, or should the ones you cannot ship without sort to
  the top?
---

A report today has two states per capability: satisfied, or a gap. Nothing in it
separates something a repo genuinely cannot ship without from something that is
good practice. When four gaps come back, the order you fix them in is your guess.

The distinction already exists in the data. Each capability in a per-ecosystem
baseline carries a required flag, and the Java baseline marks coverage optional
with everything else required. The report drops that flag while building its own
model of the baseline, so every gap comes out looking identical no matter what
the source said.

Threading it through is the small part. How it should read is the open one: a
label, a badge, a split into two lists, or an order. That is a design call, and
it is the reason this is a question rather than a plan.

What we are not doing here is deciding what counts as required. That belongs to
whoever authors the catalogue.
