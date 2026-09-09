/**
 * Card copy for the tools catalogue, authored here rather than synced.
 *
 * `catalogue.json` arrives from shared-workflows, so anything written into it is lost on the
 * next `chore: update catalogue from shared-workflows` commit. This overlay sits beside it and
 * survives that sync. A tool with no entry falls back to its upstream `summary`, mirroring the
 * `summary ?? description` fallback the skills cards already use, so a newly synced tool can
 * never render a blank card.
 *
 * Held to 68 characters: the longest `summary` on the skills side, which is what makes those
 * cards fit two lines without truncating. Upstream summaries run to 166, which is why the card
 * cannot use them directly.
 */
export const TOOL_CARD_SUMMARY_LIMIT = 68;

export const toolCardSummaries: Record<string, string> = {
  biome: "Linter and formatter for JS/TS in one fast Rust binary.",
  "ci-base-checks":
    "One image wrapping every mandatory check for Korza pipelines.",
  codeql: "Semantic code analysis that powers GitHub code scanning.",
  dependabot: "GitHub's dependency update bot, enabled by a config file.",
  eslint: "Static analysis for JS and TS, driven by a flat config.",
  gitleaks: "Scans git history and working files for committed secrets.",
  "go-test": "The Go toolchain's built-in test runner, with coverage.",
  "golangci-lint":
    "Runs staticcheck, go vet and dozens more behind one config.",
  hadolint: "Dockerfile linter with its ruleset baked into the binary.",
  jacoco: "Coverage instrumentation and reporting for JVM projects.",
  jest: "JS/TS test runner with assertions, mocking and coverage built in.",
  junit: "The standard JVM unit testing framework, built on Jupiter.",
  kingfisher: "Secrets scanner for git history and working trees.",
  playwright: "Browser tests that drive real Chromium, Firefox and WebKit.",
  prettier: "Opinionated formatter for JS, TS and related web formats.",
  pytest: "Python test framework, with coverage via the pytest-cov plugin.",
  renovate: "Opens PRs to keep dependencies current across package managers.",
  ruff: "Fast Python linter and formatter in a single tool.",
  semgrep: "Static analysis for security and correctness across languages.",
  spotbugs: "Bytecode-level static analysis for JVM projects.",
  trivy: "Vulnerability scanner for filesystems, images and IaC.",
  typescript: "Compile-time type checking for JavaScript and TypeScript.",
  vitest: "Vite-native unit test runner for JavaScript and TypeScript.",
};
