---
title: Explain CI steps the catalogue does not recognise
stage: exploring
category: gap analysis
outcome: Know what your pipeline is missing
summary: A bespoke script reads as a gap even when it does the job. We want to
  interpret those steps and label anything we infer.
question: Which of your pipeline steps do you expect this to get wrong?
---

Detection matches known tools, so a step that shells out to a script in your
repo is invisible to it, and whatever check that step satisfies reports as
missing.

A model could read those steps and say which capability they cover, grounded in
the catalogue so it cannot invent one. Anything it infers would be marked as
inferred, because a guess that reads like a fact is worse than a gap you can
see.

What is holding this up is trust rather than effort. The report today is either
right or obviously incomplete, and one confident wrong answer costs more than
the gaps it would fill.
