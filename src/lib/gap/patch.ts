import { parseDocument, isMap } from "yaml";
import type { FixBlock } from "./fix";
import type { RepoSnapshot } from "./types";

// Places a generated block into the repo's real CI file, or writes a whole new one when there is
// none. This is the half of the feature that cannot come from the catalogue: where a block goes
// depends on the file in front of us, so the insertion point is read off the parsed document
// rather than guessed from a line count.
//
// Every diff here is additive. The tool never proposes deleting a line the user wrote.

export type DiffLine = {
  kind: "context" | "added";
  /** Line number in the file after the patch applies. Absent for pure context above the hunk. */
  number: number;
  text: string;
};

export type FixPatch = {
  path: string;
  /** A new file renders differently: no context, and the UI says "create" rather than "edit". */
  mode: "edit" | "create";
  lines: DiffLine[];
  /** The clean YAML, no diff markers - what the copy button puts on the clipboard. */
  clean: string;
  addedCount: number;
};

const contextLines = 3;

/** Indent every line of a block by one level of whatever the target file already uses. */
function indentBlock(block: string, unit: string): string {
  return block
    .split("\n")
    .map((line) => (line.length > 0 ? `${unit}${line}` : line))
    .join("\n");
}

/**
 * The indentation the file's own `jobs:` entries use. A file written with four spaces should get
 * a four-space block; assuming two would produce a diff that looks wrong next to its neighbours.
 */
export function detectIndent(source: string): string {
  const match = /^jobs:\r?\n(\s+)\S/m.exec(source);
  return match ? match[1] : "  ";
}

/** Job ids already in the file, so a generated block cannot silently overwrite one. */
export function existingJobIds(source: string): string[] {
  try {
    const jobs = parseDocument(source).get("jobs");
    if (!isMap(jobs)) return [];
    return jobs.items
      .map((item) => String((item.key as { value?: unknown })?.value ?? ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Chooses which workflow to patch. A repo with several workflows usually has one that gates pull
 * requests, and that is where a check belongs; size is only the tiebreak.
 */
export function chooseTargetFile(snapshot: RepoSnapshot): string | null {
  const workflows = Object.keys(snapshot.files).filter(
    (path) =>
      path.startsWith(".github/workflows/") &&
      (path.endsWith(".yml") || path.endsWith(".yaml")),
  );
  if (workflows.length === 0) return null;
  if (workflows.length === 1) return workflows[0];

  const gatesPullRequests = workflows.filter(
    (path) =>
      /^on:|pull_request/m.test(snapshot.files[path]) &&
      /pull_request/.test(snapshot.files[path]),
  );
  const candidates =
    gatesPullRequests.length > 0 ? gatesPullRequests : workflows;

  return candidates.sort(
    (a, b) => snapshot.files[b].length - snapshot.files[a].length,
  )[0];
}

/**
 * The line after the last entry of the top-level `jobs:` mapping. Taken from the document's own
 * range rather than by scanning for indentation, so a `jobs:` key appearing inside a string or a
 * later block does not move the insertion point.
 */
function jobsInsertionLine(source: string): number | null {
  try {
    const jobs = parseDocument(source).get("jobs");
    if (!isMap(jobs) || !jobs.range) return null;

    // range[2] is the end offset including trailing whitespace and comments, so step back to the
    // last line that actually carries content.
    const upto = source.slice(0, jobs.range[2]);
    const trimmed = upto.replace(/\s+$/, "");
    return trimmed.split("\n").length;
  } catch {
    return null;
  }
}

/** A complete workflow, for a repo with no CI at all. */
export function scaffold(blocks: FixBlock[], indent = "  "): string {
  const body = blocks
    .map((block) => indentBlock(block.yaml, indent))
    .join("\n\n");

  return [
    "name: CI",
    "",
    "on:",
    `${indent}pull_request:`,
    `${indent}push:`,
    `${indent}${indent}branches: [main]`,
    "",
    "permissions:",
    // The reusable workflows authenticate to Azure over OIDC, which needs a federated token.
    // Read access to contents is the least the checkout inside them can run with.
    `${indent}contents: read`,
    `${indent}id-token: write`,
    "",
    "jobs:",
    body,
    "",
  ].join("\n");
}

function diffFor(
  insertedAt: number,
  source: string,
  block: string,
): DiffLine[] {
  const sourceLines = source.split("\n");
  const blockLines = block.split("\n");
  const lines: DiffLine[] = [];

  const before = sourceLines.slice(
    Math.max(0, insertedAt - contextLines),
    insertedAt,
  );
  before.forEach((text, index) => {
    lines.push({
      kind: "context",
      number: Math.max(0, insertedAt - contextLines) + index + 1,
      text,
    });
  });

  blockLines.forEach((text, index) => {
    lines.push({ kind: "added", number: insertedAt + index + 1, text });
  });

  const after = sourceLines.slice(insertedAt, insertedAt + contextLines);
  after.forEach((text, index) => {
    lines.push({
      kind: "context",
      number: insertedAt + blockLines.length + index + 1,
      text,
    });
  });

  return lines;
}

/**
 * Builds the patch for a set of blocks. Falls back to a whole-file scaffold when there is no CI
 * file, and also when there is one whose `jobs:` mapping cannot be located - a diff anchored to
 * the wrong line is worse than an honest "here is the file to add".
 */
export function buildPatch(
  blocks: FixBlock[],
  snapshot: RepoSnapshot,
): FixPatch | null {
  if (blocks.length === 0) return null;

  const target = chooseTargetFile(snapshot);
  if (!target) {
    const clean = scaffold(blocks);
    return {
      path: ".github/workflows/ci.yml",
      mode: "create",
      lines: clean.split("\n").map((text, index) => ({
        kind: "added" as const,
        number: index + 1,
        text,
      })),
      clean,
      addedCount: clean.split("\n").length,
    };
  }

  const source = snapshot.files[target];
  const insertionLine = jobsInsertionLine(source);
  if (insertionLine === null) {
    const clean = scaffold(blocks);
    return {
      path: ".github/workflows/ci.yml",
      mode: "create",
      lines: clean.split("\n").map((text, index) => ({
        kind: "added" as const,
        number: index + 1,
        text,
      })),
      clean,
      addedCount: clean.split("\n").length,
    };
  }

  const indent = detectIndent(source);
  const block = blocks
    .map((entry) => indentBlock(entry.yaml, indent))
    .join("\n\n");
  // A blank line before the inserted job, so it reads as a sibling rather than a continuation.
  const withSpacer = `\n${block}`;

  return {
    path: target,
    mode: "edit",
    lines: diffFor(insertionLine, source, withSpacer),
    clean: block,
    addedCount: withSpacer.split("\n").length,
  };
}
