"use client";

import { useEffect, useRef, useState } from "react";

export function PreviewInstallCommand({ command }: { command: string | null }) {
  const [copied, setCopied] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollRegion = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const region = scrollRegion.current;
    if (!region) return;
    const update = () =>
      setCanScrollRight(
        region.scrollWidth - region.clientWidth - region.scrollLeft > 1,
      );
    const frame = requestAnimationFrame(update);
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(region);
    window.addEventListener("resize", update);
    region.addEventListener("scroll", update, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", update);
      region.removeEventListener("scroll", update);
    };
  }, [command]);
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
    <div className="flex min-h-16 items-center gap-4 rounded-xl border border-line-strong bg-surface px-5 py-4 font-mono text-sm leading-relaxed text-[#e8eaed]">
      {/* Keep the overflow cue and Copy outside the scrolling region. */}
      <div className="relative min-w-0 flex-1">
        <div
          ref={scrollRegion}
          role="region"
          aria-label="Install command"
          tabIndex={0}
          className="min-w-0 flex-1 overflow-x-auto whitespace-pre [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#454950] [&::-webkit-scrollbar-thumb:hover]:bg-[#9ca3af] [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-white/10"
        >
          <span className="text-ink-faint">$</span>{" "}
          <code className="select-all">
            {command ?? "Installer unavailable. Use the manual steps below."}
          </code>
        </div>
        {command && canScrollRight && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-r from-transparent to-surface"
          />
        )}
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy install command"
        disabled={!command}
        className="w-16 shrink-0 rounded-md px-2 py-2 text-xs text-[#8b9099] transition-colors hover:bg-white/10 hover:text-[#e8eaed] disabled:pointer-events-none disabled:opacity-0"
      >
        <span key={String(copied)} className="gs-copy-label">
          {copied ? "Copied" : "Copy"}
        </span>
      </button>
      <span role="status" className="sr-only">
        {copied ? "Install command copied" : ""}
      </span>
    </div>
  );
}
