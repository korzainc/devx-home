"use client";

import { useEffect, useState } from "react";

type Line = {
  /** Typed a character at a time, with a caret, when the replay runs. */
  typed?: boolean;
  /** Colours the leading `/token` of a typed line. */
  command?: boolean;
  text: string;
  tone: "prompt" | "agent" | "quiet" | "fail" | "pass" | "rule";
  indent?: boolean;
};

/**
 * The same ask before and after one skill. The transcript is the shape `brainstorm` actually
 * produces -- a hypothesis with a confidence, then one question carrying its own guess. An
 * earlier draft batched three questions, which that skill forbids in as many words.
 */
const TRANSCRIPT: Line[] = [
  {
    typed: true,
    tone: "prompt",
    text: "write the requirements doc for the client's booking portal",
  },
  {
    tone: "agent",
    text: "● Of course! Here's a complete requirements document…",
  },
  { tone: "quiet", text: "writes 640 words. immediately." },
  { tone: "fail", text: "✗ wrong phase: half of this is phase two" },
  {
    tone: "fail",
    text: "✗ nothing in it is testable, so nobody can call it done",
  },
  { tone: "fail", text: "✗ the signed contract already covers section 1" },
  { tone: "rule", text: "" },
  {
    typed: true,
    command: true,
    tone: "prompt",
    text: "/brainstorm requirements doc for the booking portal",
  },
  {
    tone: "agent",
    text: "● HYPOTHESIS: phase one only, the booking flow and not payments",
  },
  { tone: "agent", indent: true, text: "CONFIDENCE: ~40%" },
  { tone: "agent", indent: true, text: " " },
  {
    tone: "agent",
    indent: true,
    text: "Q:     Does taking payment belong in this doc, or in phase two?",
  },
  {
    tone: "agent",
    indent: true,
    text: "GUESS: phase two. The signed contract prices it separately, and",
  },
  {
    tone: "agent",
    indent: true,
    text: "       describing it here quietly widens what you owe them.",
  },
  {
    tone: "pass",
    text: "✓ one question at a time, each with a guess you can correct",
  },
  {
    tone: "pass",
    text: "✓ agreed first, written second. 640 words you can send",
  },
];

const TONE: Record<Line["tone"], string> = {
  prompt: "text-ink",
  agent: "text-ink-muted",
  quiet: "text-ink-faint",
  fail: "text-ink-faint",
  pass: "text-ink",
  rule: "",
};

const CHAR_MS = 24;
const LINE_MS = 200;
const AFTER_TYPING_MS = 540;
/** A line eases in over this long. Longer than LINE_MS on purpose, so consecutive lines
 *  overlap slightly and the block reads as a cascade rather than a queue. */
const FADE_MS = 300;

/** 0 before the line starts, 1 once it has fully arrived. */
function progress(elapsed: number, startsAt: number): number {
  if (elapsed <= startsAt) return 0;
  return Math.min(1, (elapsed - startsAt) / FADE_MS);
}

/** Ease-out: fast at first, settling at the end, which reads as landing rather than sliding. */
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/** Where each line finishes, so one interval can drive the whole replay. */
function schedule(lines: Line[]): number[] {
  let clock = 260;
  return lines.map((line) => {
    clock += line.typed
      ? line.text.length * CHAR_MS + AFTER_TYPING_MS
      : line.tone === "rule"
        ? 320
        : LINE_MS;
    return clock;
  });
}

const TIMELINE = schedule(TRANSCRIPT);
/**
 * The schedule says when the last line *starts*; it needs FADE_MS more to finish arriving.
 * Without that the final line settles at 0.96 opacity and never reaches 1, which also left
 * the reduced-motion path rendering a not-quite-opaque transcript.
 */
const RUN_MS = (TIMELINE[TIMELINE.length - 1] ?? 0) + FADE_MS;

export function SkillsDemoTerminal() {
  /**
   * Starts where the replay starts. Seeding this at the end put the finished transcript in the
   * first paint and then rewound it, so the reader watched the text they were already reading
   * get wiped and typed back out. The transcript still reaches everyone else -- see the two
   * fallbacks below -- which is the guarantee DX-100 established, kept without the rewind.
   */
  const [elapsed, setElapsed] = useState(0);
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    // Honour reduced motion on arrival, but still replay when it is asked for explicitly.
    // `matchMedia` is guarded because jsdom does not implement it.
    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (runId === 0 && reduced) return;

    // State is written only inside the frame callback: setting it in the effect body would
    // cascade a render on mount, which `react-hooks/set-state-in-effect` rejects.
    const started = performance.now();
    let frame = requestAnimationFrame(function step() {
      const next = performance.now() - started;
      setElapsed(Math.min(next, RUN_MS));
      if (next < RUN_MS) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [runId]);

  /** Only after a replay has actually run, which is what `runId` records. */
  const announce = runId > 0 && elapsed >= RUN_MS;

  /**
   * A reader who asked for less motion is served the static copy, and the replay button on it
   * still works: pressing it is an explicit request, so from then on the animated copy is the
   * one shown whatever the media query says.
   */
  const asked = runId > 0;

  return (
    <div className="flex flex-col gap-4">
      <div
        className={`demo-live overflow-hidden rounded-xl border border-line bg-surface ${
          asked ? "" : "motion-reduce:hidden"
        }`}
      >
        <TerminalChrome onReplay={() => setRunId((id) => id + 1)} />

        {/* Lines are revealed with opacity rather than mounted on a timer, and every row is
            laid out at its finished size from the first frame, so the box holds its height
            for the whole replay and nothing below the terminal moves. Typed rows manage that
            with a hidden sizing copy of their full text; see below. */}
        <div className="flex flex-col px-5 py-5 font-mono text-[0.8rem] leading-[1.85]">
          {TRANSCRIPT.map((line, index) => {
            const startsAt = index === 0 ? 0 : (TIMELINE[index - 1] ?? 0);
            const eased = easeOut(progress(elapsed, startsAt));

            // The cut between takes draws itself across, which marks the two halves as
            // separate runs more clearly than a line that simply appears.
            if (line.tone === "rule") {
              return (
                <span
                  key={index}
                  aria-hidden="true"
                  className="my-3 border-t border-dashed border-line"
                  style={{
                    transform: `scaleX(${eased})`,
                    transformOrigin: "left",
                  }}
                />
              );
            }

            const chars = line.typed
              ? Math.min(
                  line.text.length,
                  Math.max(0, Math.round((elapsed - startsAt) / CHAR_MS)),
                )
              : line.text.length;
            const body = line.text.slice(0, chars);
            const typing =
              Boolean(line.typed) && eased > 0 && chars < line.text.length;

            return (
              <span
                key={index}
                className={`relative block break-words whitespace-pre-wrap ${TONE[line.tone]} ${
                  line.indent ? "pl-6" : ""
                }`}
                // Opacity and a small rise, both off the same clock as the typing.
                style={{
                  opacity: eased,
                  transform: `translateY(${(1 - eased) * 3}px)`,
                }}
              >
                {/* A typed row is sized by its finished text and the typing is painted over
                    the top, so the row keeps its height from the first frame. Rendering only
                    the typed slice grew the box mid-replay wherever a line wrapped, which is
                    every narrow viewport. The sizing copy is hidden from assistive tech; the
                    painted copy is the one that is read. */}
                {line.typed ? (
                  <>
                    <span aria-hidden="true" className="invisible">
                      {"> "}
                      {line.text}
                      {/* The caret's width, so a line ending right at a wrap boundary does not
                          have the caret alone wrap onto the row below. */}
                      <span className="ml-0.5 inline-block w-2" />
                    </span>
                    {/* The indent has to be repeated here: an absolutely positioned child
                        resolves against the padding box, so with `pl-6` on the row this copy
                        would paint 24px left of its sizer and wrap differently. No typed line
                        is indented today, which makes it a trap rather than a bug. */}
                    <span
                      className={`absolute inset-0 ${line.indent ? "pl-6" : ""}`}
                    >
                      <span className="text-ink-faint">{"> "}</span>
                      {line.command ? <CommandToken text={body} /> : body}
                      {typing ? (
                        <span
                          aria-hidden="true"
                          className="animate-caret ml-0.5 inline-block h-3.5 w-2 translate-y-0.5 bg-accent"
                        />
                      ) : null}
                    </span>
                  </>
                ) : (
                  body
                )}
              </span>
            );
          })}
        </div>
      </div>

      {/* The replay never runs here, so this copy is the transcript already finished. */}
      <div
        className={`demo-reduced overflow-hidden rounded-xl border border-line bg-surface ${
          asked ? "hidden" : "hidden motion-reduce:block"
        }`}
      >
        <TerminalChrome onReplay={() => setRunId((id) => id + 1)} />
        <StaticRows />
      </div>

      {/* Without JavaScript the animated copy is an empty box and the media query above cannot
          be trusted to fill it, so both are hidden and this one stands in. The stylesheet is
          inside `noscript` on purpose: a browser running scripts never parses it. */}
      <noscript>
        <style>{`.demo-live,.demo-reduced{display:none}`}</style>
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <TerminalChrome />
          <StaticRows />
        </div>
      </noscript>

      {/* Announced once, when there is something whole to announce. Announcing each line as it
          typed would read the transcript out a character at a time. */}
      <span role="status" className="sr-only">
        {announce ? "Demo finished." : ""}
      </span>
    </div>
  );
}

/** The window bar. The replay button is dropped where pressing it could do nothing. */
function TerminalChrome({ onReplay }: { onReplay?: () => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-line bg-canvas px-4 py-2.5">
      <span className="font-mono text-xs text-ink-faint">
        your agent, learning manners
      </span>
      <span className="flex-1" />
      {onReplay ? (
        <button
          type="button"
          onClick={onReplay}
          className="rounded-md border border-line px-2 py-1 font-mono text-xs text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
        >
          ↻ Replay
        </button>
      ) : null}
    </div>
  );
}

/**
 * The transcript with no clock attached: what the reader gets when the replay will not run.
 * Rows are plain text here, so none of the sizing machinery the animated copy needs applies.
 */
function StaticRows() {
  return (
    <div className="flex flex-col px-5 py-5 font-mono text-[0.8rem] leading-[1.85]">
      {TRANSCRIPT.map((line, index) =>
        line.tone === "rule" ? (
          <span
            key={index}
            aria-hidden="true"
            className="my-3 border-t border-dashed border-line"
          />
        ) : (
          <span
            key={index}
            className={`block break-words whitespace-pre-wrap ${TONE[line.tone]} ${
              line.indent ? "pl-6" : ""
            }`}
          >
            {line.typed ? <span className="text-ink-faint">{"> "}</span> : null}
            {line.typed && line.command ? (
              <CommandToken text={line.text} />
            ) : (
              line.text
            )}
          </span>
        ),
      )}
    </div>
  );
}

/** The leading `/skill` in accent, the rest plain. */
function CommandToken({ text }: { text: string }) {
  const match = /^(\/[a-z-]*)(.*)$/.exec(text);
  if (!match) return <>{text}</>;
  return (
    <>
      <span className="text-accent">{match[1]}</span>
      {match[2]}
    </>
  );
}
