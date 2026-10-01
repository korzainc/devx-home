import type { CiSignals } from "../detect";

/** Collapses whitespace runs to a single space and trims, so a quote separated only by a line
 * break or extra spacing from the source still verifies. Exported because `apply.ts` derives a
 * finding's source file with the same normalization `verifyQuote` uses below - matching them is
 * what a verified finding needs to reliably locate the entry it came from. */
export function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Caps combined signal volume before it goes into a prompt. `ciSignals()`'s raw-file fallback
 * (see `detect.ts`) can push an entire file into one shell entry when YAML parsing fails, so
 * payload size is never bounded by step count alone without this.
 *
 * `uses` and `shell` entries are interleaved before slicing to `maxEntries`, not
 * `uses`-then-`shell`: a workflow with many `uses:` refs must never crowd every `shell` entry out
 * of the budget, since CLI invocations like `semgrep --config ...` only show up as `shell` text. */
export function capSignals(
  signals: CiSignals,
  maxEntries: number,
  maxChars: number,
): CiSignals {
  const truncate = (text: string) =>
    text.length > maxChars
      ? `${text.slice(0, Math.max(0, maxChars - 1))}…`
      : text;

  const interleaved: { kind: "uses" | "shell"; index: number }[] = [];
  const max = Math.max(signals.uses.length, signals.shell.length);
  for (let i = 0; i < max; i++) {
    if (i < signals.uses.length) interleaved.push({ kind: "uses", index: i });
    if (i < signals.shell.length) interleaved.push({ kind: "shell", index: i });
  }

  const kept = interleaved.slice(0, Math.max(0, maxEntries));
  const uses = kept
    .filter((entry) => entry.kind === "uses")
    .map((entry) => {
      const source = signals.uses[entry.index];
      return { ...source, value: truncate(source.value) };
    });
  const shell = kept
    .filter((entry) => entry.kind === "shell")
    .map((entry) => {
      const source = signals.shell[entry.index];
      return { ...source, text: truncate(source.text) };
    });

  return { uses, shell };
}

/** The literal marker `formatSignals` (schema.ts) substitutes for every real newline before a
 * signal's text goes into the prompt. A `run: |` block, or the raw-file fallback in `detect.ts`,
 * would otherwise reach the model as real newlines, indistinguishable from a heading or
 * instruction in the surrounding prompt.
 *
 * Quote verification below works over text escaped the same way, so a quote reproducing exactly
 * what the model was shown still matches; escaping is a 1:1 substitution, so it never changes a
 * quote's normalized length. */
export function escapeSignalText(text: string): string {
  return text.replace(/\r\n|\r|\n/g, "⏎");
}

/** Minimum normalized quote length `verifyQuote` accepts. A hallucination guard that verifies
 * single characters or trivial fragments verifies nothing; this floor forces a quote to carry
 * enough real text to prove the finding is grounded in a specific source entry.
 *
 * A shorter floor lets through a bare tool name or "npm test" with no real invocation behind it;
 * 20 asks for something closer to a real command line before a quote counts as evidence. */
const MIN_QUOTE_LENGTH = 20;

/** True when `quote` appears verbatim (after whitespace normalization) inside at least one of
 * `sources`. This is the hallucination guard: a finding whose quote fails this check is dropped
 * by the caller, never trusted. */
export function verifyQuote(quote: string, sources: string[]): boolean {
  const needle = normalize(quote);
  if (needle.length < MIN_QUOTE_LENGTH) return false;
  return sources.some((source) => normalize(source).includes(needle));
}
