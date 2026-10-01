import type { AnalysisTool } from "../types";

/** Collapses whitespace runs to a single space and trims, so a quote separated only by a line
 * break or extra spacing from the source still verifies. */
export function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The literal marker substituted for every real newline before a signal's text goes into the
 * prompt. A `run: |` block, or the raw-file fallback in `detect.ts`, would otherwise reach the
 * model as real newlines, indistinguishable from a heading or instruction in the surrounding
 * prompt.
 *
 * Quote verification works over text escaped the same way, so a quote reproducing exactly what
 * the model was shown still matches; escaping is a 1:1 substitution, so it never changes a quote's
 * normalized length. */
export function escapeSignalText(text: string): string {
  return text.replace(/\r\n|\r|\n/g, "⏎");
}

/** Minimum normalized quote length `verifyQuote` accepts from a partial match. A hallucination
 * guard that verifies single characters or trivial fragments verifies nothing; this floor forces
 * a quote to carry enough real text to prove the finding is grounded.
 *
 * A whole entry can still be shorter than this - `npm ci` is real evidence on its own - so a quote
 * under the floor is accepted when it equals the cited entry's entire text, never otherwise. */
const MIN_QUOTE_LENGTH = 20;

/** True when `quote` appears verbatim (after whitespace normalization) inside `entryText` - the
 * one signal entry the finding named via `signalId`, never any other entry. This is the
 * hallucination guard: a finding whose quote fails this check is dropped by the caller, never
 * trusted. */
export function verifyQuote(quote: string, entryText: string): boolean {
  const needle = normalize(quote);
  const hay = normalize(entryText);
  if (needle.length === 0) return false;
  if (needle.length >= MIN_QUOTE_LENGTH) return hay.includes(needle);
  return needle === hay;
}

/** Word boundaries, so `trivy` does not match `trivyignore` and `tsc` does not match `tscpath`.
 * Mirrors `detect.ts`'s `mentions`, kept separate so this module stays free of a dependency on
 * detection internals. */
function mentionsToken(text: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^\\w./-])${escaped}(?![\\w./-])`, "i").test(text);
}

/** True when `text` relates to `tool`: it contains one of the tool's catalogue detection commands
 * or `uses:` refs (case-insensitive substring), or names the tool's id or name as a whole token.
 * The guard behind two things: a verdict citing an unrelated entry is dropped (`apply.ts`), and an
 * entry related to a candidate pair's tool is prioritized and never dropped by the input budget
 * (`budgetSignals` below). */
export function relatesToTool(text: string, tool: AnalysisTool): boolean {
  const lower = text.toLowerCase();
  const substrings = [
    ...(tool.detect.commands ?? []),
    ...(tool.detect.ciUses ?? []),
  ];
  if (
    substrings.some((needle) => needle && lower.includes(needle.toLowerCase()))
  )
    return true;
  return mentionsToken(text, tool.id) || mentionsToken(text, tool.name);
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
 * Selects and numbers the signal entries that go into the prompt. Replaces a flat entry-count cap
 * with a character budget: every entry relating to a `relatedTools` tool is kept in full (up to
 * `relatedEntryBudget` each) so a rescue or audit tool's own evidence is never the casualty of an
 * unrelated workflow's volume, then the remaining budget is filled round-robin across the other
 * entries' source files, so no single workflow crowds out every other one.
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
  const kept: Kept[] = related.map((entry) => {
    const { text, truncated } = truncate(entry.text, relatedEntryBudget);
    return { ...entry, text, truncated };
  });
  let budget =
    totalBudgetChars - kept.reduce((sum, entry) => sum + entry.text.length, 0);

  const bySource = new Map<string, RawSignalEntry[]>();
  for (const entry of other) {
    const queue = bySource.get(entry.source);
    if (queue) queue.push(entry);
    else bySource.set(entry.source, [entry]);
  }
  const queues = [...bySource.values()];

  let omittedCount = 0;
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
