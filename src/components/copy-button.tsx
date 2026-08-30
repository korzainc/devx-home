"use client";

import { useEffect, useRef, useState } from "react";

// The one client component on this page. It exists because copying is the whole point of a
// suggested fix, and there is no server-rendered way to reach the clipboard.
//
// It always copies clean YAML - never the diff's `+` markers or line numbers, which would be a
// syntax error the moment they were pasted into a workflow file.

// Both icons are inline rather than from a library: two glyphs is not worth a dependency, and
// bundling them here keeps the button self-contained. `currentColor` lets them inherit the
// text colour swap on copy, so the icon and label change together.
function ClipboardIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5"
      aria-hidden="true"
    >
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // A denied clipboard permission should not leave the button claiming success.
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <button
        type="button"
        onClick={copy}
        // Several fixes can appear on one report, so the accessible name has to name which
        // block this button belongs to rather than just saying "Copy".
        aria-label={`Copy ${label}`}
        className={`inline-flex shrink-0 cursor-pointer touch-manipulation items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
          copied
            ? "border-positive/40 bg-positive-wash text-positive"
            : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
        }`}
      >
        {copied ? <CheckIcon /> : <ClipboardIcon />}
        {/* Fixed width on the label stops the button resizing as the word changes, which would
            otherwise nudge the surrounding header on every copy. */}
        <span className="w-10 text-left">{copied ? "Copied" : "Copy"}</span>
      </button>
      {/* Announced rather than only shown: a tick that exists purely in colour and glyph tells a
          screen reader user nothing about whether the copy worked. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? `${label} copied to clipboard` : ""}
      </span>
    </>
  );
}
