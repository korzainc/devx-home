import { parse as parseYaml } from "yaml";
import type {
  AnalysisTool,
  Baseline,
  BaselineStack,
  DetectedTool,
  RepoSnapshot,
} from "./types";

// Enough for a root manifest set plus a normal workflow directory. The cap exists because the
// number of API reads has to stay bounded by something other than the size of the repo.
const maxFiles = 20;

const ciRootFiles = [
  ".gitlab-ci.yml",
  ".gitlab-ci.yaml",
  "azure-pipelines.yml",
  "azure-pipelines.yaml",
];

function isYaml(path: string) {
  return path.endsWith(".yml") || path.endsWith(".yaml");
}

/** True when the marker names an existing file, or a directory that has anything under it. */
function markerMatches(paths: string[], marker: string) {
  return paths.some((path) => path === marker || path.startsWith(`${marker}/`));
}

export function detectStacks(
  paths: string[],
  baseline: Baseline,
): BaselineStack[] {
  return baseline.stacks.filter((stack) =>
    stack.markers.some((marker) => markerMatches(paths, marker)),
  );
}

/**
 * Chooses what is worth a content read: the manifests the baseline knows about, plus CI config.
 * A marker only names a real file if it appears in the tree, which is also how directory markers
 * like `.github/workflows` get excluded here without a second list.
 */
export function filesToRead(paths: string[], baseline: Baseline): string[] {
  const manifests = baseline.stacks
    .flatMap((stack) => stack.markers)
    .filter((marker) => paths.includes(marker));

  const ci = paths.filter((path) => ciRootFiles.includes(path));

  const workflows = paths.filter(
    (path) => isYaml(path) && path.startsWith(".github/workflows/"),
  );

  // Composite actions are read as well as workflows: Korza's own repos keep their setup steps in
  // `.github/actions`, so a workflow file alone would not show what the pipeline actually runs.
  // They come last because a repo that overruns the cap is better served by its workflows.
  const composites = paths.filter(
    (path) => isYaml(path) && path.startsWith(".github/actions/"),
  );

  return [...new Set([...manifests, ...ci, ...workflows, ...composites])].slice(
    0,
    maxFiles,
  );
}

type CiSignals = {
  /** Action refs from `uses:`, with the `@ref` suffix stripped. */
  uses: { value: string; source: string }[];
  /** Shell from `run:`, GitLab `script:` and package.json scripts. */
  shell: { text: string; source: string }[];
};

const shellKeys = new Set([
  "run",
  "script",
  "before_script",
  "after_script",
  "commands",
]);

function walkCi(node: unknown, source: string, into: CiSignals) {
  if (Array.isArray(node)) {
    for (const item of node) walkCi(item, source, into);
    return;
  }
  if (!node || typeof node !== "object") return;

  for (const [key, value] of Object.entries(node)) {
    if (key === "uses" && typeof value === "string") {
      into.uses.push({ value: value.split("@")[0], source });
    } else if (shellKeys.has(key)) {
      const lines = Array.isArray(value) ? value : [value];
      for (const line of lines) {
        if (typeof line === "string") into.shell.push({ text: line, source });
      }
    } else {
      walkCi(value, source, into);
    }
  }
}

function parsePackageScripts(content: string, source: string, into: CiSignals) {
  try {
    const parsed = JSON.parse(content) as { scripts?: Record<string, string> };
    for (const command of Object.values(parsed.scripts ?? {})) {
      if (typeof command === "string")
        into.shell.push({ text: command, source });
    }
  } catch {
    // A manifest that will not parse contributes nothing rather than failing the analysis.
  }
}

/**
 * Reads the files already fetched. Package scripts count as shell because a workflow step that
 * runs `pnpm lint` says nothing on its own about which linter that is.
 */
export function ciSignals(snapshot: RepoSnapshot): CiSignals {
  const signals: CiSignals = { uses: [], shell: [] };

  for (const [path, content] of Object.entries(snapshot.files)) {
    if (path.endsWith("package.json")) {
      parsePackageScripts(content, path, signals);
      continue;
    }
    if (!isYaml(path)) continue;

    try {
      walkCi(parseYaml(content), path, signals);
    } catch {
      // Templated CI files are not always valid YAML. The raw text still supports command
      // matching, and `uses:` lines are regular enough to pull out directly.
      signals.shell.push({ text: content, source: path });
      for (const match of content.matchAll(
        /^\s*-?\s*uses:\s*["']?([^"'\s]+)/gm,
      )) {
        signals.uses.push({ value: match[1].split("@")[0], source: path });
      }
    }
  }

  return signals;
}

/** Word boundaries, so `trivy` does not match `trivyignore` and `tsc` does not match `tscpath`. */
function mentions(text: string, command: string) {
  const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\w./-])${escaped}(?![\\w./-])`).test(text);
}

function dependsOn(snapshot: RepoSnapshot, dep: string): string | null {
  for (const [path, content] of Object.entries(snapshot.files)) {
    if (path.endsWith("package.json")) {
      try {
        const parsed = JSON.parse(content) as Record<
          string,
          Record<string, string> | undefined
        >;
        // Only the dependency maps: a name in `scripts` means a command, which the shell
        // signals already cover, and counting it here would report the wrong evidence.
        const declared = [
          parsed.dependencies,
          parsed.devDependencies,
          parsed.peerDependencies,
        ].some((map) => map && dep in map);
        if (declared) return path;
      } catch {
        continue;
      }
      continue;
    }
    if (mentions(content, dep)) return path;
  }
  return null;
}

// A config file inside vendored or generated output belongs to a dependency, not to this repo.
// Without this, any Go repo with a `vendor/` directory reports whatever its dependencies use.
const notOwnedByRepo =
  /(^|\/)(vendor|node_modules|third_party|testdata|\.venv|\.yarn|dist|build|target)\//;

// pyproject.toml is Python's central config file for many tools at once; its mere existence
// proves nothing about which of them are actually configured there. Content markers for the
// two catalogue tools that share it as a configFiles signal - keyed by tool id, not stored in
// the catalogue, the same way dependsOn()'s package.json parsing is devx-home-only knowledge.
// Anchored to line start so a table header inside a comment or string can't false-match, and
// widened to also match a sub-table (e.g. `[tool.ruff.lint]`), which ruff and pytest both allow
// in place of the bare table.
const pyprojectMarkers: Record<string, RegExp> = {
  ruff: /^\s*\[\s*tool\.ruff[\].]/m,
  pytest: /^\s*\[\s*tool\.pytest[\].]/m,
};

/**
 * A root-level file is the strongest signal. Nested matches still count, because a monorepo can
 * hold its only linter config in a package directory, but vendored paths are excluded.
 */
function configFileMatch(paths: string[], candidate: string): string | null {
  if (paths.includes(candidate)) return candidate;

  const suffix = `/${candidate}`;
  return (
    paths.find((path) => path.endsWith(suffix) && !notOwnedByRepo.test(path)) ??
    null
  );
}

// A shared config file only counts as evidence when it actually configures this specific tool -
// existence alone can't distinguish "configured here" from "just also present" for a file more
// than one tool lists. Root-only: a nested match's content is never fetched (see filesToRead), so
// there's nothing to check there either way. If the root file's content failed to fetch (network
// error, oversized file - see github.ts), it's treated as unconfirmed rather than credited.
function configuresPyproject(
  tool: AnalysisTool,
  candidate: string,
  hit: string,
  snapshot: RepoSnapshot,
): boolean {
  if (candidate !== "pyproject.toml" || hit !== candidate) return true;
  const marker = pyprojectMarkers[tool.id];
  if (!marker) return true;
  return marker.test(snapshot.files[hit] ?? "");
}

// A real sub-action path is plain path segments, nothing else - the prefix match above already
// guarantees the value starts with the catalogue's own trusted family name, so the suffix past
// that point is the only part a repo controls. This string lands in a document a coding agent
// is handed as ground truth, so a suffix that doesn't look like a path is dropped rather than
// echoed: the family name alone is still true, just less specific.
const subActionPath = /^[\w.-]+(?:\/[\w.-]+)*$/;

function usesEvidence(action: string, value: string): string {
  if (value === action) return `uses: ${action}`;
  const suffix = value.slice(action.length + 1);
  return subActionPath.test(suffix)
    ? `uses: ${action}/${suffix}`
    : `uses: ${action}`;
}

/** Signals are OR'd. CI evidence is preferred because this reports on pipelines, not checkouts. */
function evidenceFor(
  tool: AnalysisTool,
  snapshot: RepoSnapshot,
  signals: CiSignals,
): string | null {
  for (const action of tool.detect.ciUses ?? []) {
    // A catalogue entry can name an action family (e.g. github/codeql-action), invoked in the
    // wild only through a specific sub-action (.../analyze, /init, /upload-sarif); the trailing
    // "/" requires a real path boundary, so a family name never matches an unrelated action that
    // merely shares its prefix.
    const hit = signals.uses.find(
      (entry) => entry.value === action || entry.value.startsWith(`${action}/`),
    );
    if (hit) return usesEvidence(action, hit.value);
  }

  for (const command of tool.detect.commands ?? []) {
    const hit = signals.shell.find((entry) => mentions(entry.text, command));
    if (hit) return `runs ${command} in ${hit.source}`;
  }

  for (const candidate of tool.detect.configFiles ?? []) {
    const hit = configFileMatch(snapshot.paths, candidate);
    if (!hit) continue;
    if (!configuresPyproject(tool, candidate, hit, snapshot)) continue;
    return hit;
  }

  for (const dep of tool.detect.manifestDeps ?? []) {
    const hit = dependsOn(snapshot, dep);
    if (hit) return `${dep} in ${hit}`;
  }

  return null;
}

export function detectTools(
  snapshot: RepoSnapshot,
  tools: AnalysisTool[],
): DetectedTool[] {
  const signals = ciSignals(snapshot);
  const found: DetectedTool[] = [];

  for (const tool of tools) {
    const evidence = evidenceFor(tool, snapshot, signals);
    if (evidence) found.push({ id: tool.id, name: tool.name, evidence });
  }

  return found;
}
