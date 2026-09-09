"use client";

import { useEffect, useRef, useState } from "react";

/** One thing to copy. `target` names the file a snippet is pasted into, and switches the block
 *  from a single-line command to a `pre` that keeps its indentation: a Maven block or a workflow
 *  step is inert until it is inside the right file, and the payload alone does not say which. */
export type InstallBlock = {
  label?: string;
  target?: string;
  content: string;
  note?: string;
  /** What the copy control says it copies, for screen readers. Worth stating separately from
   *  `label`, which is often absent, and from `target`, which names a file rather than the
   *  snippet going into it. */
  name: string;
};

/** One tab. `/skills/[plugin]` puts an agent here and gives it two blocks; `/tools/[id]` puts an
 *  install method here and gives it one. `extra` hangs off the tab rather than off the panel so
 *  it appears only while that tab is showing: a tool with both an Action and a Homebrew formula
 *  must not list the Action's inputs under `brew install`. */
export type InstallTab = {
  id: string;
  label: string;
  blocks: InstallBlock[];
  extra?: React.ReactNode;
};

function CopyIcon({ copied }: { copied: boolean }) {
  return (
    // A check in the same box as the icon it replaces: a word here grew the button and took the
    // width off the command beside it.
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
  );
}

/** Keyed on its content by the panel, so switching tabs remounts it and clears `copied`. */
function Block({ block }: { block: InstallBlock }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(block.content);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard needs a secure context and permission. The content is selectable either way.
    }
  }

  const button = (
    <button
      type="button"
      onClick={copy}
      className="shrink-0 rounded-md p-1.5 text-ink-faint transition-colors hover:bg-surface hover:text-ink"
    >
      <span className="sr-only">Copy {block.name.toLowerCase()}</span>
      <CopyIcon copied={copied} />
    </button>
  );

  return (
    <div className="flex flex-col gap-1.5">
      {block.label && (
        <span className="text-[0.65rem] tracking-wide text-ink-faint uppercase">
          {block.label}
        </span>
      )}
      {block.target ? (
        <div className="overflow-hidden rounded-lg border border-line bg-canvas">
          <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2">
            <span className="text-xs text-ink-faint">Add to</span>
            <code className="font-mono text-xs text-ink-muted">
              {block.target}
            </code>
          </div>
          <div className="flex items-start gap-2 py-2.5 pr-2 pl-4">
            <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-sm text-ink select-all">
              {block.content}
            </pre>
            {button}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas py-2.5 pr-2 pl-4">
          <code className="min-w-0 flex-1 overflow-x-auto font-mono text-sm whitespace-nowrap text-ink select-all">
            {block.content}
          </code>
          {button}
        </div>
      )}
      {block.note && <p className="text-xs text-ink-faint">{block.note}</p>}
      {/* The icon says it silently. Outside the button, so the button's own name stays put. */}
      <span role="status" className="sr-only">
        {copied ? `${block.name} copied` : ""}
      </span>
    </div>
  );
}

/** Standalone command field used by the getting-started manual steps. */
export function CommandField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return <Block block={{ label, content: value, name: `${label} command` }} />;
}

/**
 * The install section both detail pages render. It owns the chrome, the tab row and the copy
 * behaviour; what a tab means and what its blocks contain is the caller's business, which is why
 * a plugin's agents and a tool's install methods can share it without either page knowing about
 * the other.
 */
export function InstallPanel({ tabs }: { tabs: InstallTab[] }) {
  const [picked, setPicked] = useState(tabs[0]?.id);
  const active = tabs.find((tab) => tab.id === picked) ?? tabs[0];
  if (!active) return null;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-medium text-ink">Install</h2>
        {/* A lone tab offers a choice that isn't there, but leaving one unnamed means a reader
            cannot tell a workflow step from a shell command without reading the payload. */}
        {tabs.length === 1 ? (
          <span className="font-mono text-xs text-ink-faint">
            {active.label}
          </span>
        ) : (
          <div className="flex gap-1 rounded-lg border border-line bg-canvas p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={tab.id === active.id}
                onClick={() => setPicked(tab.id)}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  tab.id === active.id
                    ? "border border-line-strong bg-accent-wash text-ink"
                    : "border border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {active.blocks.map((block) => (
        <Block key={block.content} block={block} />
      ))}
      {active.extra}
    </section>
  );
}
