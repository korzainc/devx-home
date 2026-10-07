import type { AnalysisTool } from "../types";

/** Collapses whitespace runs and trims, so a quote that differs only in line breaks or spacing
 * still verifies. */
export function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Makes repo text one inert prompt line: newlines become `⏎` (a literal `⏎` becomes `↵`) and runs
 * of 3+ `<`/`>` become `‹`/`›`. All 1:1 in length, so quotes still match and `toDisplayText` can
 * undo it. */
export function escapeSignalText(text: string): string {
  return text
    .replace(/⏎/g, "↵")
    .replace(/\r\n|\r|\n/g, "⏎")
    .replace(/<{3,}/g, (run) => "‹".repeat(run.length))
    .replace(/>{3,}/g, (run) => "›".repeat(run.length));
}

/** Shortest partial quote `verifyQuote` accepts. A shorter one passes only as a whole entry or a
 * whole line, like `go build ./...`. */
const MIN_QUOTE_LENGTH = 20;

/** True when `quote` appears verbatim, after whitespace normalization, in the entry the finding
 * cited. */
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
 * as a whole token. Topical, not proof the tool runs. */
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

/** The form of `quote` found in the cited entry outside shell comments, tolerating a leaked
 * rendered prefix, or null. Returns the matching form so callers show the real text. */
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
  /** The unescaped source path for reports. `source` is escaped for the prompt. */
  rawSource: string;
  truncated: boolean;
};

export type SignalBudget = {
  entries: IndexedSignal[];
  truncatedCount: number;
  omittedCount: number;
};

// Hard limits on the raw-signal block, counted over each rendered line.
const totalBudgetChars = 60_000;
const maxEntries = 400;
const defaultEntryBudget = 1_500;
const relatedEntryBudget = 4_000;
// A clamped entry shorter than this is omitted instead.
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

/** Picks and numbers the deduped entries sent to the model, within `totalBudgetChars` and
 * `maxEntries` (the last one is clamped to fit). Entries about candidate tools go first; the rest
 * fill round-robin across files. */
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
