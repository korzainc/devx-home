// Nothing under src/lib/gap imports from next/*, react or the data files. The route wires the
// catalogue and the baseline in as arguments, so lifting this directory into a shared package for
// local Claude Code use is a move rather than a rewrite.

/** Signals that a tool is in use. Any one match is enough, so they are OR'd, never AND'd. */
export type DetectSignals = {
  /** Action refs, matched against `uses:` in CI files without the `@ref` suffix. */
  ciUses?: string[];
  /** Programs, matched as whole words against the shell in `run:` and `script:` steps. */
  commands?: string[];
  /** Repo-relative paths. A basename match anywhere in the tree also counts. */
  configFiles?: string[];
  /** Dependency names, matched against the manifests that were read. */
  manifestDeps?: string[];
};

/** The subset of a catalogue tool the analysis needs. `ToolEntry` satisfies it structurally. */
export type AnalysisTool = {
  id: string;
  name: string;
  capabilities: string[];
  stacks: string[];
  detect: DetectSignals;
  /** Tools this one wraps. A wrapped tool is never itself recommended once this one covers
   * the same capability (see analyze.ts). */
  wraps?: { tool: string; capabilities: string[] }[];
};

export type Baseline = {
  /** Render order for the report. Categories outside this list sort to the end. */
  categories: string[];
  capabilities: Record<string, { label: string; category: string }>;
  /** Expected regardless of stack. */
  universal: string[];
  stacks: BaselineStack[];
};

/** What the baseline says about one capability for one stack: the recommended tool, and
 * which others are acceptable alternatives. */
export type BaselineExpectation = {
  recommended: string;
  acceptable: string[];
};

export type BaselineStack = {
  id: string;
  label: string;
  /** Root-level filenames, or directories matched as a path prefix. */
  markers: string[];
  expects: Record<string, BaselineExpectation>;
};

export type RepoRef = { provider: "github"; owner: string; repo: string };

/** How a ref is written in the report, so `analyze` never handles a provider's addressing. */
export function refLabel(ref: RepoRef): string {
  return `${ref.owner}/${ref.repo}`;
}

/** Thrown by readers, so `run` can map a status without knowing which provider failed. */
export class RepoReadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "RepoReadError";
  }
}

/**
 * One provider's half of the analysis: turn what someone pasted into a ref, then read that repo
 * into a snapshot. Everything downstream sees only the snapshot, so a second provider means a
 * second reader rather than a change to `detect` or `analyze`.
 */
export type RepoReader = {
  /** Null when the input does not address this provider, which is how `run` picks a reader. */
  parseRef(input: string): RepoRef | null;
  loadSnapshot(
    ref: RepoRef,
    token: string,
    baseline: Baseline,
  ): Promise<RepoSnapshot>;
};

export type RepoSnapshot = {
  ref: RepoRef;
  defaultBranch: string;
  /** Every tracked path in the tree. Cheap to scan, so config file detection needs no fetches. */
  paths: string[];
  /** Contents of the handful of files worth reading, keyed by path. */
  files: Record<string, string>;
};

export type Match = {
  /** Which signal fired, phrased for the report: `uses: codecov/codecov-action`. */
  evidence: string;
};

export type DetectedTool = Match & {
  id: string;
  name: string;
};

/** A tool the baseline recommends to close a gap. More than one can appear at once: a repo
 * matching two stacks, e.g. a JS+Go monorepo, gets a recommendation from each. */
export type RecommendedTool = {
  id: string;
  name: string;
};

export type CapabilityReport = {
  id: string;
  label: string;
  satisfied: boolean;
  /** Tools found in the repo that cover this capability. */
  present: DetectedTool[];
  /** Catalogue tools that would cover it, limited to the stacks detected. Empty when satisfied. */
  recommended: RecommendedTool[];
};

export type CategoryReport = {
  category: string;
  capabilities: CapabilityReport[];
};

export type Analysis = {
  repo: string;
  defaultBranch: string;
  stacks: BaselineStack[];
  /** Surfaced in the report so the result is auditable rather than a black box. */
  filesRead: string[];
  categories: CategoryReport[];
  satisfiedCount: number;
  gapCount: number;
};
