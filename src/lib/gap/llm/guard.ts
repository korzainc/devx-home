import type { AnalysisTool } from "../types";

/** Collapses whitespace runs to a single space and trims, so a quote separated only by a line
 * break or extra spacing from the source still verifies. */
export function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The literal marker substituted for every real newline before a signal's text goes into the
 * prompt, so a `run: |` block (or the raw-file fallback in `detect.ts`) always reaches the model
 * as one visible line, never mistaken for a heading or instruction.
 *
 * Also neutralizes any run of three or more `<` or `>` characters - the shape of the block
 * markers below - wherever repo text (entry text, source paths, `with:` values) might otherwise
 * carry a fake one into the prompt. Escaping is a 1:1 substitution, so it never changes a quote's
 * normalized length and a quote reproducing exactly what the model was shown still matches. */
export function escapeSignalText(text: string): string {
  return text
    .replace(/\r\n|\r|\n/g, "⏎")
    .replace(/<{3,}/g, (run) => "‹".repeat(run.length))
    .replace(/>{3,}/g, (run) => "›".repeat(run.length));
}

/** Minimum normalized quote length `verifyQuote` accepts from a partial match. A hallucination
 * guard that verifies single characters or trivial fragments verifies nothing; this floor forces
 * a quote to carry enough real text to prove the finding is grounded.
 *
 * A whole entry, or one whole line of a multi-line entry, can still be shorter than this -
 * `go build ./...` is real evidence on its own - so a quote under the floor is also accepted
 * against those two shapes, never as a fragment of a longer line. */
const MIN_QUOTE_LENGTH = 20;

/** True when `quote` appears verbatim (after whitespace normalization) inside `entryText` - the
 * one signal entry the finding named via `signalId`, never any other entry. This is the
 * hallucination guard: a finding whose quote fails this check is dropped by the caller, never
 * trusted. */
export function verifyQuote(quote: string, entryText: string): boolean {
  const needle = normalize(quote);
  if (needle.length === 0) return false;
  if (needle.length >= MIN_QUOTE_LENGTH)
    return normalize(entryText).includes(needle);

  const lines = entryText.split("⏎").map(normalize);
  return needle === normalize(entryText) || lines.includes(needle);
}

/** Word boundaries, so `trivy` does not match `trivyignore` and `tsc` does not match `tscpath`.
 * Mirrors `detect.ts`'s `mentions`, kept separate so this module stays free of a dependency on
 * detection internals. */
function mentionsToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\w./-])${escaped}(?![\\w./-])`, "i").test(text);
}

/** True when `text` relates to `tool`: one of its catalogue detection commands or `uses:` refs,
 * or its id or name, appears as a whole token - never a raw substring, the same word-boundary
 * rule `detect.ts` uses. Backs two checks: a verdict citing an unrelated quote is dropped
 * (`apply.ts`), and an entry related to a candidate pair's tool is prioritized by the input
 * budget below. */
export function relatesToTool(text: string, tool: AnalysisTool): boolean {
  const needles = [
    ...(tool.detect.commands ?? []),
    ...(tool.detect.ciUses ?? []),
    tool.id,
    tool.name,
  ];
  return needles.some((needle) => needle && mentionsToken(text, needle));
}

/** Drops everything from a `#` to the end of each line, so a comment naming a tool can't make a
 * quote elsewhere on the line "relate" to it. Entry text is single-line with `⏎` markers at this
 * point, so each `⏎`-separated segment is treated as its own line. */
export function stripShellComments(text: string): string {
  return text
    .split("⏎")
    .map((line) => line.replace(/#.*$/, ""))
    .join("⏎");
}

export type RawSignalEntry = {
  kind: "uses" | "shell";
  text: string;
  source: string;
};

export type IndexedSignal = RawSignalEntry & {
  id: string;
  /** The real, unescaped source path - what a `DetectedBuildStep` should attribute a finding to.
   * `source` above is escaped for prompt rendering and must never reach a report field. */
  rawSource: string;
  truncated: boolean;
};

export type SignalBudget = {
  entries: IndexedSignal[];
  truncatedCount: number;
  omittedCount: number;
};

// Roughly the total character budget for the raw-signal block, and the default per-entry cap
// within it. Both are "about" figures, not contract limits: a related entry can run over its own
// cap up to `relatedEntryBudget`, and the last entry let through before the total budget runs out
// can push the total slightly past `totalBudgetChars`.
const totalBudgetChars = 60_000;
const defaultEntryBudget = 1_500;
const relatedEntryBudget = 4_000;

function truncate(
  text: string,
  max: number,
): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, Math.max(0, max - 1))}…`, truncated: true };
}

/**
 * Selects and numbers the signal entries that go into the prompt against one character budget
 * every entry counts against. Entries related to a candidate pair's tool go first, kept at up to
 * `relatedEntryBudget` chars each until the budget runs out; the rest fill the remaining budget
 * round-robin across source files, so no single workflow crowds out every other one.
 *
 * Identical entries (same kind and text) are deduped first, keeping the first source seen.
 */
export function budgetSignals(
  rawEntries: RawSignalEntry[],
  relatedTools: AnalysisTool[],
): SignalBudget {
  const seen = new Set<string>();
  const deduped = rawEntries.filter((entry) => {
    const key = `${entry.kind}:${entry.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const isRelated = (entry: RawSignalEntry) =>
    relatedTools.some((tool) => relatesToTool(entry.text, tool));
  const related = deduped.filter(isRelated);
  const other = deduped.filter((entry) => !isRelated(entry));

  type Kept = RawSignalEntry & { truncated: boolean };
  const kept: Kept[] = [];
  let budget = totalBudgetChars;
  let omittedCount = 0;

  for (const entry of related) {
    if (budget <= 0) {
      omittedCount++;
      continue;
    }
    const { text, truncated } = truncate(entry.text, relatedEntryBudget);
    kept.push({ ...entry, text, truncated });
    budget -= text.length;
  }

  const bySource = new Map<string, RawSignalEntry[]>();
  for (const entry of other) {
    const queue = bySource.get(entry.source);
    if (queue) queue.push(entry);
    else bySource.set(entry.source, [entry]);
  }
  const queues = [...bySource.values()];

  let remaining = other.length;
  let cursor = 0;
  while (remaining > 0) {
    const queue = queues[cursor % queues.length];
    cursor++;
    if (queue.length === 0) continue;
    const entry = queue.shift();
    if (!entry) continue;
    remaining--;
    if (budget <= 0) {
      omittedCount++;
      continue;
    }
    const { text, truncated } = truncate(entry.text, defaultEntryBudget);
    kept.push({ ...entry, text, truncated });
    budget -= text.length;
  }

  const entries: IndexedSignal[] = kept.map((entry, index) => ({
    id: `s${index + 1}`,
    kind: entry.kind,
    text: escapeSignalText(entry.text),
    source: escapeSignalText(entry.source),
    rawSource: entry.source,
    truncated: entry.truncated,
  }));

  return {
    entries,
    truncatedCount: entries.filter((entry) => entry.truncated).length,
    omittedCount,
  };
}

/** Undoes prompt-only formatting before a quote reaches a report field: the real newline a `⏎`
 * marker stands for, and the `…` a truncated entry was cut with - that character was added by
 * `budgetSignals` above, never real file text, so it is stripped rather than shown as if it were. */
export function toDisplayText(text: string): string {
  return text.replace(/⏎/g, "\n").replace(/…/g, "");
}
