"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

// The one interactive thing on the gap report. The prompt itself is built on the server and
// arrives as a prop, so this component holds no report knowledge and the markdown never has to be
// generated twice.

const lapMs = 700;

function Sparkle({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M11 2.2l1.75 5.05L17.8 9l-5.05 1.75L11 15.8l-1.75-5.05L4.2 9l5.05-1.75L11 2.2z" />
      <path
        d="M18.4 14.2l.85 2.45 2.45.85-2.45.85-.85 2.45-.85-2.45-2.45-.85 2.45-.85.85-2.45z"
        opacity=".65"
      />
    </svg>
  );
}

function CopyButton({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        // Clipboard access can be refused outright, and a button that says Copied when nothing
        // was copied is worse than one that appears not to have registered the click.
        navigator.clipboard.writeText(prompt).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          },
          () => {},
        );
      }}
      className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
        copied ? "text-positive" : "text-ink-faint hover:bg-line/40 hover:text-ink"
      }`}
    >
      {copied ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="h-3.5 w-3.5"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="h-3.5 w-3.5"
        >
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 012-2h8" />
        </svg>
      )}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// A native dialog rather than a positioned div, because `showModal` is what makes the page behind
// it inert, traps Tab inside the panel, and hands focus back to the button on the way out. Escape
// comes from the browser too, so there is no key listener here.
//
// No close button: the backdrop and Escape both dismiss it, and a third way to leave would only
// crowd the header the prompt title sits in.
function PromptOverlay({
  prompt,
  onClose,
}: {
  prompt: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // Dismissal hangs off mousedown, not click. Selecting the prompt and releasing the mouse
      // past the edge of the panel produces a click whose target is the backdrop, which would
      // otherwise close the dialog in the middle of copying out of it.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) ref.current?.close();
      }}
      aria-labelledby="fix-prompt-title"
      className="m-auto max-h-[80vh] w-full max-w-3xl rounded-xl border border-line-strong bg-surface-raised p-0 shadow-2xl backdrop:bg-canvas/70 backdrop:backdrop-blur-sm"
    >
      {/* The dialog itself shows no surface: any padding on it would be backdrop that does not
          dismiss, since a click there targets the dialog exactly as the backdrop does. */}
      <div className="flex max-h-[80vh] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex items-center gap-2">
            <Sparkle className="h-3.5 w-3.5 text-positive" />
            <h3 id="fix-prompt-title" className="text-sm font-medium text-ink">
              Fix instructions for optimising CI pipeline
            </h3>
          </div>
          <CopyButton prompt={prompt} />
        </div>

        {/* Focusable so the overflow can be reached by keyboard, not only by dragging a bar. */}
        <pre
          tabIndex={0}
          className="flex-1 overflow-auto px-5 py-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink-muted"
        >
          {prompt}
        </pre>

        <p className="border-t border-line px-5 py-3 text-center text-xs text-ink-faint">
          Paste into your coding agent with the repo open.
        </p>
      </div>
    </dialog>
  );
}

export function FixPromptButton({ prompt }: { prompt: string }) {
  const [open, setOpen] = useState(false);
  const [charging, setCharging] = useState(false);

  // Navigating away hides this route rather than unmounting it, so `open` survives the trip and
  // comes back true while the dialog has silently dropped out of the top layer: no backdrop, no
  // focus trap, and `showModal` throws on the second visit because the element is already open.
  // Closing it on the way out is what the framework asks for from a dialog that initialises
  // itself when it opens.
  useLayoutEffect(() => {
    return () => {
      setCharging(false);
      setOpen(false);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // The lap is the whole point of the delay, so without it there is nothing to wait for.
          if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            return setOpen(true);
          }
          setCharging(true);
          setTimeout(() => {
            setCharging(false);
            setOpen(true);
          }, lapMs);
        }}
        // The CSS reads the duration from here, so the lap and the wait cannot drift apart.
        style={{ "--fx-lap": `${lapMs}ms` } as React.CSSProperties}
        className={`fx-sweep ${
          charging ? "is-charging" : ""
        } inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-positive px-3 py-1.5 text-sm font-medium text-positive transition-colors hover:bg-positive-wash`}
      >
        <Sparkle />
        Generate fix prompt
      </button>

      {open ? (
        <PromptOverlay prompt={prompt} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
