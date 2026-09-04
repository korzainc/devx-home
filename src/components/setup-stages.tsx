"use client";

import { useEffect, useRef, useState } from "react";
import { stages } from "@/lib/getting-started";

/**
 * A preview of the six stages the one-command installer will run, as the setup PRD describes
 * them. Static screens, one per stage, so the page can show what the tool does before it exists.
 * The stage rail is the control; play steps through the screens on a timer.
 */

/* Tones map onto the site's tokens rather than raw colours, so the screens follow the theme. */
function D({ children }: { children: React.ReactNode }) {
  return <span className="text-ink-faint">{children}</span>;
}
function G({ children }: { children: React.ReactNode }) {
  return <span className="text-positive">{children}</span>;
}
function A({ children }: { children: React.ReactNode }) {
  return <span className="text-amber-500">{children}</span>;
}
function R({ children }: { children: React.ReactNode }) {
  return <span className="text-accent">{children}</span>;
}

const SCREENS: React.ReactNode[] = [
  <>
    <D>$</D> ./devx setup{"\n\n"}
    <D>korza ▸ devx setup · v0.1 · macOS 15.4 · Apple Silicon</D>
    {"\n\n"}Checking this machine first.{"\n\n"}
    {"  "}
    <G>✓</G> macOS 15.4 <D>supported</D>
    {"\n  "}
    <G>✓</G> Apple Silicon <D>supported</D>
    {"\n  "}
    <G>✓</G> Admin rights <D>yes</D>
    {"\n  "}
    <G>✓</G> Disk <D>214 GB free</D>
    {"\n  "}
    <G>✓</G> Network <D>reachable</D>
    {"\n\n"}Now scanning for known tools.
  </>,
  <>
    Checked this machine. Select what to set up.{"\n"}
    <D>↑↓ move · space toggle · enter continue · r reinstall · q quit</D>
    {"\n\n  "}
    <G>✓</G> Homebrew <D>installed · 4.3.1</D> <D>skip</D>
    {"\n  "}
    <G>✓</G> Git <D>installed · user.name not set</D> <A>configure only</A>
    {"\n  "}
    <R>●</R> GitHub CLI <D>not found</D> install + sign in
    {"\n  "}
    <R>●</R> Claude Code <D>not found</D> install + Korza skills
    {"\n  "}
    <D>○</D> Python (uv) <D>not found · optional</D>
    {"\n  "}
    <D>○</D> Node (fnm) <D>not found · optional</D>
    {"\n\n"}
    <A>3 steps selected · about 6 minutes · 1 step needs your browser</A>
  </>,
  <>
    Here is the plan.{"\n\n  "}
    <D>1.</D> Xcode Command Line Tools <D>required by Homebrew</D>
    {"\n  "}
    <D>2.</D> Git <D>set name and email</D>
    {"\n  "}
    <D>3.</D> GitHub CLI <D>install, then sign in</D>
    {"\n  "}
    <D>4.</D> Claude Code <D>install, then sign in</D>
    {"\n\n  "}
    <A>About 6 minutes. Two of these open your browser.</A>
    {"\n\n  "}One managed block is added to <D>~/.zshrc</D>.{"\n  "}Nothing else
    in that file changes.{"\n\n"}
    <D>enter to start · q to leave</D>
  </>,
  <>
    Running. You can walk away, it will wait where it needs you.{"\n\n  "}
    <G>✓</G> Xcode Command Line Tools <D>done · 2m 14s</D>
    {"\n  "}
    <G>✓</G> Git <D>name and email set</D>
    {"\n  "}
    <A>●</A> GitHub CLI <A>waiting for you in the browser</A>
    {"\n  "}
    <D>○</D> Claude Code <D>queued</D>
    {"\n\n  "}
    <D>Opened github.com/login/device</D>
    {"\n  "}
    <D>Your code:</D> <A>WXYZ-1234</A>
  </>,
  <>
    Checking that each one actually works, not just that it exists.{"\n\n  "}
    <G>✓</G> <D>git --version</D> 2.46.0
    {"\n  "}
    <G>✓</G> <D>gh auth status</D> signed in as you
    {"\n  "}
    <G>✓</G> <D>claude --version</D> 2.1.0
    {"\n  "}
    <G>✓</G> <D>claude plugin list</D> codezen ready
    {"\n\n  "}
    <D>
      Re-run in a fresh shell, so none of this depends on the terminal you are
      looking at.
    </D>
  </>,
  <>
    {"  "}
    <G>✓</G> Homebrew <D>already installed · 4.3.1 · skipped</D>
    {"\n  "}
    <G>✓</G> Git <D>already installed · name and email set by this run</D>
    {"\n  "}
    <G>✓</G> GitHub CLI <A>installed by this run</A> <D>· signed in as you</D>
    {"\n  "}
    <G>✓</G> Claude Code <A>installed by this run</A>{" "}
    <D>· korza-marketplace registered · codezen ready</D>
    {"\n  "}
    <D>○</D> Python (uv) <D>optional · not selected</D>
    {"\n\n  "}
    <A>→</A> Next: open a repo and run <A>/brainstorm</A>
    {"\n\n  "}
    <D>Run</D> devx doctor <D>any time to check this machine again.</D>
  </>,
];

const STEP_MS = 2600;

export function SetupStages() {
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setAt((current) => {
        if (current === SCREENS.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, STEP_MS);
    return () => clearInterval(timer.current);
  }, [playing]);

  function pick(index: number) {
    setPlaying(false);
    setAt(index);
  }

  function togglePlay() {
    if (playing) return setPlaying(false);
    // From the top if it is already sitting on the last screen.
    if (at === SCREENS.length - 1) setAt(0);
    setPlaying(true);
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="Setup stages"
        className="flex flex-wrap gap-1.5"
      >
        {stages.map((stage, index) => {
          const on = index === at;
          return (
            <button
              key={stage}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => pick(index)}
              className={`min-w-24 flex-1 rounded-lg border px-2 py-2 font-mono text-[0.65rem] tracking-wide uppercase transition-colors ${
                on
                  ? "border-line-strong bg-surface-raised text-ink"
                  : "border-line bg-surface text-ink-faint hover:border-line-strong hover:text-ink"
              }`}
            >
              {index + 1} {stage}
            </button>
          );
        })}
      </div>

      <pre
        role="tabpanel"
        className="min-h-72 overflow-x-auto rounded-xl border border-line-strong bg-[#050607] p-5 font-mono text-[0.8rem] leading-relaxed whitespace-pre-wrap text-[#e8eaed]"
      >
        {SCREENS[at]}
      </pre>

      <div className="flex items-center gap-4 text-sm">
        <button
          type="button"
          onClick={togglePlay}
          className="rounded-lg border border-line-strong px-3.5 py-1.5 text-ink transition-colors hover:border-ink"
        >
          {playing ? "Stop" : "Play walkthrough"}
        </button>
        <span className="font-mono text-xs text-ink-faint">
          Stage {at + 1} of {stages.length}
        </span>
      </div>
    </div>
  );
}
