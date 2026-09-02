---
date: 2026-09-03
title: A plugin page now names the skill you clicked to get there
---

Open a skill from the [skills catalogue](/skills) and the plugin page tells you
which one you came for, instead of leaving you to find it among the plugin's
other twenty-four.

### The strip above the fold

A panel above "What it solves" names the skill, repeats its summary, and says
where it sits in the plugin — "18 of 25". Its **Show in list ↓** control reveals
the card and moves focus onto it, so a keyboard reader ends up where the view
does.

The list below keeps its own order and its five-card preview. It no longer
unfolds or scrolls itself when you arrive, which used to push the install
commands behind you and made what you saw depend on how you got there.

### Sharing a skill link

The skill now travels in the query string rather than the URL fragment:
`/skills/mattpocock-skills?skill=wizard`. A fragment is a scroll instruction to
a browser, not data, so the old links landed you partway down the page.

Links are stable, so they are worth pasting into Linear or Slack. If a skill is
renamed upstream, or has not been released yet, the strip says the link no
longer resolves rather than silently showing you nothing.
