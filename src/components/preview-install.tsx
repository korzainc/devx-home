"use client";

import { useEffect, useRef, useState } from "react";

export function PreviewInstallCommand({ command }: { command: string | null }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard needs a secure context and permission. The command is selectable either way.
    }
  }

  return (
    <div className="flex items-start gap-2 rounded-xl border border-line-strong bg-[#050607] p-5 font-mono text-sm leading-relaxed text-[#e8eaed]">
      {/* Show a scrollbar only on overflow; keep Copy outside the scrolling region. */}
      <div
        role="region"
        aria-label="Install command"
        tabIndex={0}
        className="min-w-0 flex-1 overflow-x-auto pb-2 whitespace-pre focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#6b7280] [&::-webkit-scrollbar-thumb:hover]:bg-[#9ca3af] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-white/10"
      >
        <span className="text-ink-faint">$</span>{" "}
        <code className="select-all">
          {command ?? "Installer unavailable. Use the manual steps below."}
        </code>
      </div>
      <button
        type="button"
        onClick={copy}
        disabled={!command}
        className="shrink-0 rounded-md p-1.5 text-[#8b9099] transition-colors hover:bg-white/10 hover:text-[#e8eaed] disabled:pointer-events-none disabled:opacity-0"
      >
        <span className="sr-only">Copy install command</span>
        <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none">
          {copied ? (
            <path
              d="m5 13 4 4L19 7"
              className="text-positive"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <>
              <rect
                x="9"
                y="9"
                width="11"
                height="11"
                rx="2"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M5 15V5a2 2 0 0 1 2-2h10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </>
          )}
        </svg>
      </button>
      <span role="status" className="sr-only">
        {copied ? "Install command copied" : ""}
      </span>
    </div>
  );
}
