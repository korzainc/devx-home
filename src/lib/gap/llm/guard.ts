import type { AnalysisTool } from "../types";

/** Collapses whitespace runs to a single space and trims, so a quote separated only by a line
 * break or extra spacing from the source still verifies. */
export function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Rewrites repo text so it can sit inside the prompt as one line of inert data. Real newlines
 * become `⏎`; a literal `⏎` in the repo becomes `↵` so the two never collide. A run of three or
 * more `<` or `>` (the shape of the block markers below) becomes `‹`/`›`.
 *
 * Every substitution is 1:1 in length, so a quote that reproduces what the model saw still
 * matches, and `toDisplayText` can undo exactly what this introduced. */
export function escapeSignalText(text: string): string {
  return text
    .replace(/⏎/g, "↵")
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

/** True when `quote` appears verbatim (after whitespace normalization) inside `entryText`, the
 * one entry the finding named via `signalId`. Findings that fail this are dropped. */
export function verifyQuote(quote: string, entryText: string): boolean {
  const needle = normalize(quote);
  if (needle.length === 0) return false;
  if (needle.length >= MIN_QUOTE_LENGTH)
    return normalize(entryText).includes(needle);

  const lines = entryText.split("⏎").map(normalize);
  return needle === normalize(entryText) || lines.includes(needle);
}

/** Word boundaries, so `trivy` does not match `trivyignore` and `tsc` does not match `tscpath`.
 * Unlike `detect.ts`'s `mentions`, case-insensitive. */
function mentionsToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\w./-])${escaped}(?![\\w./-])`, "i").test(text);
}

/** True when `text` names `tool`: a catalogue command or `uses:` ref, or the tool's id or name,
 * as a whole token. A topical check, not proof the tool runs. Used to drop verdicts whose quote
 * is about something else and to order budgeted entries. */
export function relatesToTool(text: string, tool: AnalysisTool): boolean {
  const needles = [
    ...(tool.detect.commands ?? []),
    ...(tool.detect.ciUses ?? []),
    tool.id,
    tool.name,
  ];
  return needles.some((needle) => needle && mentionsToken(text, needle));
}

function stripLineComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === "\\" && quote !== "'") {
      i++;
    } else if (quote) {
      if (char === quote) quote = null;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "#" && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

/** Drops each line's shell comment: an unquoted `#` at a word start, to the end of the line.
 * Lines are the `⏎`-separated segments of an escaped entry. */
export function stripShellComments(text: string): string {
  return text.split("⏎").map(stripLineComment).join("⏎");
}

const renderedPrefix = /^(?:\[s\d+\]\s*)?(?:(?:uses|run):\s*)?/;

/** Removes a leading `[sN] `, `uses: ` or `run: ` the prompt rendered in front of an entry. */
export function stripRenderedPrefix(quote: string): string {
  return quote.replace(renderedPrefix, "");
}

/** The form of `quote` that appears in the cited entry outside any shell comment, tolerating a
 * leaked rendered prefix, or null when neither form does. Returns the matching form so callers
 * show and check the real text. */
export function verifiedQuote(
  quote: string,
  entry: Pick<RawSignalEntry, "kind" | "text">,
): string | null {
  const visible =
    entry.kind === "shell" ? stripShellComments(entry.text) : entry.text;
  for (const candidate of [quote, stripRenderedPrefix(quote)]) {
    if (verifyQuote(candidate, visible)) return candidate;
  }
  return null;
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

// Hard limits on the raw-signal block, counted over each rendered line (id, label, text, source).
const totalBudgetChars = 60_000;
const maxEntries = 400;
const defaultEntryBudget = 1_500;
const relatedEntryBudget = 4_000;
// A clamped entry shorter than this carries no usable evidence, so it is omitted instead.
const minClampedChars = 20;

/** The prompt line for one entry, newline excluded. */
export function formatSignalLine(
  entry: Pick<IndexedSignal, "id" | "kind" | "text" | "source">,
): string {
  const label = entry.kind === "uses" ? "uses" : "run";
  return `[${entry.id}] ${label}: ${entry.text} (${entry.source})`;
}

function truncate(
  text: string,
  max: number,
): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: `${text.slice(0, Math.max(0, max - 1))}…`, truncated: true };
}

/**
 * Selects and numbers the signal entries that go into the prompt, within one hard budget of
 * `totalBudgetChars` and `maxEntries`. Entries related to a candidate pair's tool go first (up to
 * `relatedEntryBudget` chars each); the rest fill what remains round-robin across source files,
 * so no single workflow crowds out the others. The last entry is clamped to fit.
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

  const entries: IndexedSignal[] = [];
  let budget = totalBudgetChars;
  let omittedCount = 0;

  const place = (entry: RawSignalEntry, cap: number) => {
    if (entries.length >= maxEntries) {
      omittedCount++;
      return;
    }
    const id = `s${entries.length + 1}`;
    const source = escapeSignalText(entry.source);
    // Each line costs its overhead plus the joining newline.
    const overhead =
      formatSignalLine({ id, kind: entry.kind, text: "", source }).length + 1;
    const room = Math.min(cap, budget - overhead);
    const fits = entry.text.length <= room;
    if (!fits && room < minClampedChars) {
      omittedCount++;
      return;
    }
    const { text, truncated } = truncate(entry.text, room);
    const indexed: IndexedSignal = {
      id,
      kind: entry.kind,
      text: escapeSignalText(text),
      source,
      rawSource: entry.source,
      truncated,
    };
    budget -= formatSignalLine(indexed).length + 1;
    entries.push(indexed);
  };

  for (const entry of related) place(entry, relatedEntryBudget);

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
    const entry = queue.shift();
    if (!entry) continue;
    remaining--;
    place(entry, defaultEntryBudget);
  }

  return {
    entries,
    truncatedCount: entries.filter((entry) => entry.truncated).length,
    omittedCount,
  };
}

/** Undoes what `escapeSignalText` and truncation added before text reaches a report field: `⏎`
 * becomes a newline and `‹‹‹`/`›››` runs become `<`/`>` again. The trailing `…` is only stripped
 * when `truncated`, so a real ellipsis in repo text stays. */
export function toDisplayText(text: string, truncated = false): string {
  const restored = text
    .replace(/⏎/g, "\n")
    .replace(/‹{3,}/g, (run) => "<".repeat(run.length))
    .replace(/›{3,}/g, (run) => ">".repeat(run.length));
  return truncated ? restored.replace(/…$/, "") : restored;
}
