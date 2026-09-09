/**
 * Display overrides for capability labels that arrive from the synced catalogue.
 *
 * `taxonomy.capabilities[id].label` is already human copy, so this is not a replacement for it:
 * it holds only the ids whose upstream label leads with an acronym expansion nobody reads, or
 * names the thing differently from the rest of the portal. Anything absent falls through to
 * upstream, which keeps the divergence from shared-workflows down to exactly the lines below and
 * makes it cheap to drop one if upstream improves.
 *
 * Ids are never touched. They key the gap-analysis baselines, so renaming one here would change
 * which checks a stack is required to have.
 */
export const capabilityLabelOverrides: Record<string, string> = {
  // "Static Application Security Testing (SAST)" leads with the expansion; the acronym is the
  // part an engineer scans for, so it keeps the parenthetical and loses the preamble.
  sast: "Code Security (SAST)",
  // "Dependency Scanning (SCA)" sits one row from "Dependency Updates" and the two read as the
  // same thing until you notice the acronym. This says what it finds instead.
  sca: "Dependency Vulnerabilities",
  "iac-config": "Infrastructure Config",
  "image-scan": "Container Scanning",
  "iac-dockerfile-lint": "Dockerfile Linting",
  "lint-bugs": "Bug Detection",
  "dependency-updates": "Dependency Updates",
};
