---
title: Sign in, so analysis reads repos as you
stage: planned
category: access
outcome: Analyse any repo you can already read
summary:
  Gap analysis reads repos with one shared server token, so it sees what that
  token sees rather than what you can see.
question: Anything about your organisation's setup that would break this?
---

A shared token is either more access than the person using it has, or less, and
never exactly theirs. It also means adding a new organisation is a request
somebody has to approve rather than something you can just do.

Signing in with your Git host fixes both. The analysis reads as you, and your
own access decides what it can open. GitHub comes first because that is where
most Korza work lives, with GitLab and Azure DevOps behind it.

This is queued rather than in flight. It is also what everything on this page
that involves writing something depends on, because a vote or a comment needs to
know who left it.
