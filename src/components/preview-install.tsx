"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// The origin never changes after load, so there is nothing to subscribe to;
// this only exists to give useSyncExternalStore a subscribe function.
function subscribe() {
  return () => {};
}
function getSnapshot() {
  return window.location.origin;
}
// The server has no origin of its own to report, and guessing one would
// mismatch whatever this deployment's real origin turns out to be.
function getServerSnapshot() {
  return null;
}

/**
 * The one command, built from the browser's own origin so it is correct on
 * localhost and on every Vercel preview without any configuration. Renders a
 * placeholder until the client value is available, so server and client
 * agree on the first paint and there is nothing to hydrate around.
 */
export function PreviewInstallCommand() {
  const origin = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const command = origin ? `curl -fsSL ${origin}/setup | sh` : null;

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
    <div className="relative overflow-x-auto rounded-xl border border-line-strong bg-[#050607] p-5 font-mono text-sm leading-relaxed whitespace-pre text-[#e8eaed]">
      <button
        type="button"
        onClick={copy}
        disabled={!command}
        className="absolute top-3 right-3 rounded-md p-1.5 text-[#8b9099] transition-colors hover:bg-white/10 hover:text-[#e8eaed] disabled:pointer-events-none disabled:opacity-0"
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
      <span className="text-ink-faint">$</span>{" "}
      {command ?? "curl -fsSL <this preview>/setup | sh"}
    </div>
  );
}
