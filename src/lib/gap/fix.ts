import { invocationFor, preferredFor } from "@/lib/catalogue/adapt";
import type {
  Catalogue,
  CatalogueTool,
  Invocation,
} from "@/lib/catalogue/schema";
import type { RepoSnapshot } from "./types";

// Turns a gap into the YAML that closes it. No model in the path: `invocation` already carries
// the action ref, every input and a note per input, so this transcribes rather than writes. That
// matters because the value of a suggestion here is its provenance - the catalogue vetted this
// wiring, and a plausible-looking guess would be worth less than showing nothing.
//
// Anything this file cannot source from the catalogue or the snapshot, it leaves at the
// catalogue's default and lets the arg's own note prompt the user. Confidently wrong beats
// nothing only if you never have to trust it.

export type FixBlock = {
  /** Capability ids this one block closes. A bundle closes several at once. */
  capabilities: string[];
  entryId: string;
  entryName: string;
  jobId: string;
  yaml: string;
  /** Repo-level vars or secrets the user has to create before this runs. */
  prerequisites: string[];
  docsUrl?: string;
};

export type UnwiredGap = {
  capability: string;
  /** The entries the baseline names, none of which carry CI wiring yet. */
  candidates: string[];
};

export type FixPlan = {
  blocks: FixBlock[];
  /** Gaps we deliberately say nothing about, rather than guessing. */
  unwired: UnwiredGap[];
};

/** Indentation the generated block is written at, before being re-indented to match a target. */
const indentUnit = "  ";

function quote(value: string): string {
  // GitHub expressions must survive byte for byte, and an empty string has to stay explicit
  // rather than becoming a YAML null.
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function renderValue(value: string | number | boolean): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return quote(value);
}

/** A job id derived from the entry, kept unique against the ids already in the target file. */
export function jobIdFor(entryId: string, taken: Iterable<string>): string {
  const base = entryId.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
  const used = new Set(taken);
  if (!used.has(base)) return base;

  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** Repo vars and secrets an arg's value references, which the user must create first. */
function prerequisitesIn(args: Record<string, { value: unknown }>): string[] {
  const found = new Set<string>();
  for (const arg of Object.values(args)) {
    if (typeof arg.value !== "string") continue;
    for (const match of arg.value.matchAll(
      /\$\{\{\s*(?:vars|secrets)\.([A-Za-z0-9_]+)\s*\}\}/g,
    )) {
      found.add(match[1]);
    }
  }
  return [...found].sort();
}

/**
 * Tier 1 tailoring: arguments the snapshot can answer better than the catalogue's default. Each
 * override is a lookup in the file tree, never a guess - an ambiguous case is left alone so the
 * arg's note stays the thing that prompts the user.
 */
export function tailorArgs(
  args: Record<string, { value: string | number | boolean; note: string }>,
  snapshot: RepoSnapshot,
): Record<string, { value: string | number | boolean; note: string }> {
  const paths = snapshot.paths;
  const tailored = { ...args };

  const override = (key: string, value: string | number | boolean) => {
    if (key in tailored) tailored[key] = { ...tailored[key], value };
  };

  // A Dockerfile that is not there means the image build and scan should stay switched off,
  // which is exactly what an empty `dockerfile_path` already means to the workflow.
  const dockerfile = paths.find(
    (path) => path === "Dockerfile" || path.endsWith("/Dockerfile"),
  );
  if (dockerfile) {
    override("dockerfile_path", dockerfile);
    const context = dockerfile.includes("/")
      ? dockerfile.slice(0, dockerfile.lastIndexOf("/"))
      : ".";
    override("dockerfile_context", context);
  }

  // Point the suppression arguments at a real ignore file when the repo has one. Leaving these
  // empty when the file exists would silently re-report findings the repo already triaged.
  const ignoreFile = (candidates: string[]) =>
    paths.find((path) => candidates.includes(path));

  const scaIgnore = ignoreFile([".trivyignore", "trivyignore"]);
  if (scaIgnore) override("sca_ignore_file", scaIgnore);

  const secretsExclude = ignoreFile([".kingfisherignore", ".gitleaksignore"]);
  if (secretsExclude) override("secrets_exclude_file", secretsExclude);

  return tailored;
}

/** Renders one invocation as a `jobs:` entry. Only the two reference runners are emitted. */
export function renderJob(
  jobId: string,
  invocation: Invocation,
  args: Record<string, { value: string | number | boolean; note: string }>,
): string {
  const lines = [`${jobId}:`, `${indentUnit}uses: ${invocation.action}`];

  const argEntries = Object.entries(args);
  if (argEntries.length > 0) {
    lines.push(`${indentUnit}with:`);
    for (const [key, arg] of argEntries) {
      // The note goes on its own line above the value rather than trailing it: these notes are
      // whole sentences, and trailing them puts a 120-column comment on every input.
      lines.push(`${indentUnit}${indentUnit}# ${arg.note}`);
      lines.push(`${indentUnit}${indentUnit}${key}: ${renderValue(arg.value)}`);
    }
  }

  // Reusable workflows here authenticate to Azure through OIDC, which needs the caller to pass
  // its secrets through. `inherit` is what the shared-workflows docs call for.
  lines.push(`${indentUnit}secrets: inherit`);

  return lines.join("\n");
}

/**
 * Resolves each gap to the entry the baseline prefers, keeping only those with real CI wiring.
 * Several gaps resolving to one entry produce one block, not several: `ci-base-checks` covers six
 * capabilities, and printing it six times would misrepresent the size of the change.
 */
export function planFixes(
  gaps: string[],
  ecosystems: string[],
  snapshot: RepoSnapshot,
  catalogue: Catalogue,
  takenJobIds: string[] = [],
): FixPlan {
  const byEntry = new Map<
    string,
    { entry: CatalogueTool; invocation: Invocation; capabilities: string[] }
  >();
  const unwired: UnwiredGap[] = [];

  for (const capability of gaps) {
    const candidates = ecosystems.flatMap((ecosystem) =>
      preferredFor(catalogue, ecosystem, capability),
    );

    let wired = false;
    for (const candidateId of candidates) {
      const entry: CatalogueTool | undefined =
        catalogue.bundles[candidateId] ?? catalogue.tools[candidateId];
      if (!entry) continue;

      const invocation = invocationFor(entry, capability);
      if (!invocation?.action) continue;

      const existing = byEntry.get(entry.id);
      if (existing) existing.capabilities.push(capability);
      else
        byEntry.set(entry.id, {
          entry,
          invocation,
          capabilities: [capability],
        });

      wired = true;
      break;
    }

    // Saying nothing is the correct output here. Most catalogue entries carry no `invocation`,
    // and inventing a step for one would be exactly the unvetted guess this design rules out.
    if (!wired)
      unwired.push({ capability, candidates: [...new Set(candidates)] });
  }

  const taken = new Set(takenJobIds);
  const blocks: FixBlock[] = [...byEntry.values()].map(
    ({ entry, invocation, capabilities }) => {
      const args = tailorArgs(invocation.args ?? {}, snapshot);
      const jobId = jobIdFor(entry.id, taken);
      taken.add(jobId);

      return {
        capabilities,
        entryId: entry.id,
        entryName: entry.name,
        jobId,
        yaml: renderJob(jobId, invocation, args),
        prerequisites: prerequisitesIn(args),
        docsUrl: entry.docsUrl,
      };
    },
  );

  return { blocks, unwired };
}
