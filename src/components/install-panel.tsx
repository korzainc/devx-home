"use client";

import { useEffect, useRef, useState } from "react";
import type { InstallCommand } from "@/lib/catalogue-entries";

/** Keyed on its command by the caller, so switching agents remounts it and clears `copied`. */
function CommandField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard needs a secure context and permission. The command is selectable either way.
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[0.65rem] tracking-wide text-ink-faint uppercase">
        {label}
      </span>
      <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas py-2.5 pr-2 pl-4">
        <code className="flex-1 overflow-x-auto font-mono text-sm whitespace-nowrap text-ink select-all">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md p-1.5 text-ink-faint transition-colors hover:bg-surface hover:text-ink"
        >
          <span className="sr-only">Copy {label.toLowerCase()} command</span>
          {/* A check in the same box as the icon it replaces: a word here grew the button and
              took the width off the command beside it. */}
          <svg
            aria-hidden
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
          >
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
        {/* The icon says it silently. Outside the button, so the button's own name stays put. */}
        <span role="status" className="sr-only">
          {copied ? `${label} command copied` : ""}
        </span>
      </div>
    </div>
  );
}

export function InstallPanel({ commands }: { commands: InstallCommand[] }) {
  const [agent, setAgent] = useState(commands[0]?.agent);
  const active = commands.find((entry) => entry.agent === agent) ?? commands[0];
  if (!active) return null;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium text-ink">Install</h2>
        {/* Only rendered for an agent the plugin actually lists, so a single-agent plugin
            shows one control rather than a dead tab. */}
        <div className="flex gap-1 rounded-lg border border-line bg-canvas p-1">
          {commands.map((entry) => (
            <button
              key={entry.agent}
              type="button"
              aria-pressed={entry.agent === active.agent}
              onClick={() => setAgent(entry.agent)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                entry.agent === active.agent
                  ? "border border-line-strong bg-accent-wash text-ink"
                  : "border border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {entry.agent}
            </button>
          ))}
        </div>
      </div>

      <CommandField
        key={active.register}
        label="Register once per machine"
        value={active.register}
      />
      <CommandField
        key={active.install}
        label="Install"
        value={active.install}
      />
    </section>
  );
}
