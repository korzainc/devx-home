---
title: Test the skills before they ship
stage: planned
category: skills
outcome: Trust that an update did not quietly break a skill
summary:
  A skill can get worse without failing. We want a suite that runs each one
  against known tasks and says what changed.
question: Which skill has changed under you in a way you only noticed later?
---

Nothing today catches a skill that still runs and answers worse than it did last
week. A prompt edit, a model swap or an upstream version bump can all do it, and
none of them shows up as a failure.

The harness runs a maintained set of tasks against a skill and reports numbers
you can compare across versions: how often it finds what it should, how often it
invents something, whether a deterministic check passed. It runs the same input
several times and reports how much the answers agree with each other, because a
skill that is right on average and different every time is not one you can build
on.

When something breaks it should say where. Inputs, tool calls, the steps in
between and the output are all captured, so the answer is a diff rather than a
pass or fail.

First one under test is the security review skill in CodeZen, chosen because its
failures are already known and worth grading against.

Two things this is not. It does not benchmark the underlying models, only what
we build on them. And it stays small on purpose: a short suite that is kept
current beats a large one nobody tends.
