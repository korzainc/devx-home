# CI fix suggestions — proposal

Status: **approved, in progress.** Deterministic scope only; no LLM in the path.

Goal: for every gap the report finds, show the user the exact YAML change that closes it — as a git-style diff against their real CI file, or as a whole new file when they have none.

---

## 0. What the catalogue PRs change (read first)

- PR #56 replaces the flat placeholder with a per-entity catalogue: `taxonomy.json`, `tools/*.json`, `baselines/*.json`, `bundles/*.json`.
- PR #70 aggregates those into one `catalogue.json` and PRs it into `devx-home/src/data/catalogue.json` on a `catalogue-v*` tag.
- `detection` is now **vendor-keyed** — `detection.github.{ciUses,commands}`, plus vendor-neutral `configFiles` / `manifestDeps`.
- `applicability.{languages,buildSystems}` replaces the flat `stacks` array.
- Capability ids all change: `sca`, `sast`, `secrets`, `iac-config`, `lint-style`, `lint-bugs`, `image-scan`, `iac-dockerfile-lint`, `typecheck`, `unit-tests`, `e2e-tests`, `coverage`, `format`, `dependency-updates`.
- Baselines are now per-capability objects — `{recommended, acceptable[], required}` — not a flat `expects[]` list.
- `bundles/` is a new entity type: one entry (`ci-base-checks`) wrapping Kingfisher, Semgrep, Trivy, hadolint behind a single reusable workflow.
- **`invocation` is the new field that makes this feature possible** — vendor-keyed, capability-keyed, carrying `action`, `runner`, `args` (each with a `note`), and `scope`.
- Validator vocabulary: `runner` is one of `docker-run`, `reusable-workflow`, `github-action`.

## 1. Blocking findings — decide these before any code

- **Only 5 of 23 entries carry `invocation`** — `ci-base-checks`, `semgrep`, `trivy`, `kingfisher`, `hadolint`. All 5 resolve to Korza reusable workflows.
- **18 entries have no `invocation` at all** — ESLint, Prettier, Biome, Vitest, Jest, Playwright, TypeScript, Renovate, Dependabot, pytest, ruff, junit, jacoco, spotbugs, golangci-lint, go-test, codeql, typescript.
- Consequence: we can emit a **real, trustworthy** fix for Korza-owned checks, and **nothing** for the ecosystem tools — the data to write their CI step does not exist.
- **Only `baselines/java.json` exists.** No JS/TS/Go/Python baseline in the new catalogue, so today a JS repo compares against an empty baseline and reports zero gaps.
- Proposal: ship fixes **only where `invocation` exists**, and render an honest "no wiring in the catalogue yet" state for the rest. Do not hand-write snippets in devx-home — that re-creates the placeholder problem the catalogue PRs exist to kill.
- Proposal: treat missing baselines as a **catalogue gap to raise upstream**, not something devx-home papers over.

## 2. Scope

- In scope: GitHub Actions only — `invocation.azureDevops` is `{}` everywhere.
- In scope: diff against an existing workflow file; whole-file scaffold when none exists.
- In scope: syntax-highlighted, copyable code blocks.
- Out of scope: opening a PR against the user's repo, or any write to GitHub.
- Out of scope: Azure DevOps output, until the catalogue carries it.
- Out of scope: LLM-generated YAML — breaks the determinism `analyze.ts` is explicitly built on.

## 3. Schema translation layer (prerequisite)

- New `src/lib/catalogue/schema.ts` — types mirroring the real `catalogue.json` artifact.
- New `src/lib/catalogue/adapt.ts` — maps artifact shape onto the `AnalysisTool` / `Baseline` types `lib/gap` already consumes.
- Flatten `tools` + `bundles` into one detectable list; a bundle is a tool that satisfies several capabilities.
- Map `detection.github.*` + vendor-neutral `configFiles`/`manifestDeps` onto the existing `DetectSignals`.
- Map `applicability.languages` onto the current `stacks` filter; treat `*` as today's `any`.
- Derive category order from `taxonomy.categories` instead of the hardcoded array.
- Honour `baseline.required` — a missing `required:false` capability is advisory, not a failure.
- Prefer `recommended` over `acceptable[]` when ranking what to suggest.
- Keep `lib/gap/*` free of `next/*`, `react` and data imports, as the existing header comment demands.

## 4. Fix generation — `src/lib/gap/fix.ts`

- Pure function, no network, no model: `(analysis, snapshot, catalogue) => FixPlan[]`.
- One `FixPlan` per gap that has a resolvable `invocation.github` entry.
- Resolve capability -> entry: `baseline.recommended` first, then `acceptable[]`, skip if neither carries `invocation`.
- Emit `runner: reusable-workflow` as a `jobs.<id>.uses` block with `with:` args.
- Carry each arg's `note` through as a trailing YAML comment, so the pasted block is self-documenting.
- Preserve `${{ vars.* }}` expressions verbatim — never resolve or escape them.
- **Coalesce**: if several gaps resolve to the same entry (`ci-base-checks` covers 4+ capabilities), emit ONE block, not four.
- Record which capabilities each block closes, for the UI to attribute it back to the gaps.
- Flag `needsSetup` when args reference repo `vars`/`secrets` the user must create first.

## 4a. What "tailored" means — three tiers, no model

- **Tier 1 (free, from the snapshot):** which gaps appear; `service_path` from the real manifest location; `dockerfile_path`/`dockerfile_context` empty when no Dockerfile in `paths`; `iac_config_path` from a detected infra dir; `*_ignore_file` args pointed at real ignore files when they exist; indentation and quote style matched to the target file; job-id collision avoidance from parsed `jobs:` keys.
- **Tier 2 (real work, still deterministic):** insertion point via the YAML CST; merge-into-existing-job vs. add-new; coalescing several gaps onto one bundle block; detecting an existing `ci.yml@v2` call and emitting an upgrade rather than a duplicate.
- **Tier 3 (out of scope, would need a model):** prose about why a check matters for this repo; restructuring a badly organised workflow; inferring intent from an unusual monorepo layout; CI for the 18 tools with no `invocation`.
- Where a Tier 1 lookup is genuinely ambiguous (two plausible infra dirs), fall back to the catalogue default and let the arg's own `note` prompt the user — never guess confidently.

## 5. Diff rendering — existing CI file

- Reuse the snapshot: the workflow text is already fetched, no extra API call.
- Choose the target file: single workflow -> that one; several -> the one whose triggers best match (`pull_request`), else the largest.
- Parse with `yaml`'s document/CST API to get **real line positions** for the `jobs:` mapping.
- Compute the insertion point as the end of the `jobs` block; capture 3 lines of real context either side.
- Emit a genuine unified diff — real line numbers, `+` lines only (we never delete user YAML).
- Detect existing indentation and match it rather than assuming 2 spaces.
- Fall back to the whole-file scaffold if position tracking fails, rather than emitting a wrong anchor.

## 6. Scaffold rendering — no CI file

- Emit a complete `.github/workflows/ci.yml`, presented as a new-file diff (all `+`).
- Include `name`, `on: [pull_request, push:main]`, `permissions`, and the resolved job blocks.
- Set least-privilege `permissions` — reusable workflows here need `id-token: write` for Azure OIDC.
- Include the setup preamble the args imply (the three `CI_COMMON_AZURE_*` repo vars) as comments.
- Validate our own output: round-trip parse the generated YAML before rendering it.

## 7. UX — stage 1, `ux-designer` (run before any markup)

- Decide container: inline disclosure under each gap vs. a per-report "Suggested fixes" section.
- Recommendation to validate: **inline collapsed disclosure**, so evidence and remedy stay adjacent — but coalesced blocks argue for a section. Resolve in stage 1.
- Design the attribution when one block closes several gaps — each gap must point at the shared block without duplicating it.
- Define states: fix available / no wiring in catalogue / capability not required / setup prerequisites needed.
- Write the honest empty-state copy for the 18 tools with no `invocation`.
- Decide whether `required: false` gaps are visually demoted.
- Decide focus order and what a screen reader announces when a disclosure expands.
- Decide the copy-button confirmation pattern and its announcement.

## 8. UI — stage 2, `frontend-design`

- Owns palette and typeface per CLAUDE.md; must fit the existing `ink` / `accent` / `line` tokens.
- Design the diff block: added-line tint, gutter, line numbers, filename header.
- Ensure added-line meaning does not ride on green alone — carry the `+` glyph.
- Design the copy affordance and its success state.
- Any new animation needs a `motion-safe:` guard, per CLAUDE.md.

## 9. Syntax highlighting

- Use Shiki, server-side, at render time — zero client JS, matches the current no-client-JS report.
- Pin a theme pair that works in both light and dark; render both, toggle with CSS.
- Highlight YAML with diff-line tinting layered over Shiki output, not a `lang-diff` grammar.
- Copy button is the only client component — a tiny island, and it copies the clean YAML, not the `+` prefixes.

## 10. Audit — stage 3, `web-design-guidelines`

- Run against the finished code, from the pinned local snapshot, offline.
- Do not re-flag the known-verified items in CLAUDE.md (`:focus-visible`, `animate-breathe` guards).
- Check the copy button's accessible name and its live-region confirmation.
- `tabular-nums` on diff line numbers — this is a view that genuinely renders number columns.

## 11. Tests

- `fix.test.ts` — resolution, coalescing, arg/note rendering, `${{ }}` preservation.
- Diff-anchor tests against real fixture workflows, including a deliberately awkward one.
- A test asserting generated YAML re-parses and its `uses` matches the catalogue `action`.
- A test asserting no fix is emitted for an entry lacking `invocation`.
- Adapter tests: new artifact in, current `AnalysisTool`/`Baseline` out.
- Snapshot test on a scaffold, so wording drift is deliberate.

## 12. Sequencing

- 1. Confirm the two blocking findings in section 1 with the catalogue owner.
- 2. Schema translation + adapter, behind the existing tests.
- 3. `fix.ts` + tests, headless, no UI.
- 4. `ux-designer` stage 1.
- 5. `frontend-design` stage 2 + Shiki.
- 6. `web-design-guidelines` stage 3.
- 7. Raise the missing-baselines gap upstream in shared-workflows.

## 13. Open questions

- Do PRs #56/#70 land before this, or do we build against the branch? They are stacked and still open.
- Is the intent that Korza reusable workflows are the ONLY thing we ever suggest, and ecosystem tools stay detect-only?
- If so, should the report stop recommending ESLint/Prettier by name, since we can never wire them?
- Should `invocation` gain entries for ecosystem tools, or is that deliberately out of Korza's scope?
- Which `@v` ref do we pin — the catalogue says `@v3`; does devx-home follow the catalogue blindly?
- Where do the JS/TS/Go/Python baselines come from, and who writes them?
- Should a repo already calling `ci.yml@v2` be told to upgrade, or left alone?
