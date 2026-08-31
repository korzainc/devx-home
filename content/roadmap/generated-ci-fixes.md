---
title: Write the fix, not just the finding
stage: planned
category: gap analysis
outcome: Close a gap without writing the YAML yourself
summary:
  A report that names what is missing still leaves you to write it. The next
  step is a CI snippet built for your repo, not a generic example.
question: Would you rather see the fix inside the report, or ask for it after
  you have read the gaps?
---

Gap analysis compares your repo against the catalogue and stops at the list. It
does not write the fix, because a snippet nobody has run against your repo can
easily be wrong, and a wrong fix costs more than no fix.

Writing it was the point of building the catalogue. The catalogue already knows
which tool to use, how to invoke it, and what it needs from a repo. Grounded in
that, plus your build system and your existing workflow file, the snippet can be
yours rather than a copied example.

Two trial runs so far. On a Spring repo with CI already, four gaps closed with a
single block anchored into the existing `gradle-build.yml`. On a repo with no CI
at all, a complete new `ci.yml`.

What is still open is how a fix earns your trust before you paste it: running it
against the repo, a review step, or something else. Opening the pull request for
you comes later, if ever, and only once generation itself has proved itself.
