import type { ReactNode } from "react";

const muted = "text-[#7a7a82]";
const ready = "text-[#5fd07a]";

function ToolRow({
  name,
  status,
  installed = false,
  selected = false,
  expandable = false,
}: {
  name: string;
  status: string;
  installed?: boolean;
  selected?: boolean;
  expandable?: boolean;
}) {
  return (
    <div className="mb-2 grid grid-cols-1 gap-x-3 sm:mb-0 sm:grid-cols-[minmax(0,26ch)_minmax(0,1fr)]">
      <span className="flex min-w-0 gap-[1ch]">
        <span aria-hidden className="w-[1ch] shrink-0 text-[#e5484d]">
          {selected ? "❯" : ""}
        </span>
        <span aria-hidden className={installed ? ready : "text-[#d9a441]"}>
          {installed ? "✓" : "●"}
        </span>
        <span>
          {selected ? <b>{name}</b> : name}
          {expandable ? " ▸" : ""}
        </span>
      </span>
      <span
        className={`pl-[4ch] whitespace-nowrap sm:pl-0 ${installed ? ready : muted}`}
      >
        {status}
      </span>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className={muted}>── {title}</p>
      {children}
    </div>
  );
}

/** An illustrative setup screen. Text reflows on phones instead of shrinking. */
export function TerminalPreview() {
  return (
    <figure className="w-full min-w-0 rounded-xl border border-[#e5484d]/25 bg-[linear-gradient(135deg,#2a1214,#161014)] p-3 sm:p-5">
      <div
        role="region"
        aria-label="Example Korza CLI setup screen"
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-white/10 bg-[#0e0e10] px-3 py-5 font-mono text-sm leading-[1.75] text-[#d6d6d6] sm:px-6 sm:py-[22px] sm:text-sm"
      >
        <div className="w-full">
          <pre
            aria-hidden="true"
            className="mb-5 overflow-x-auto text-[10px] leading-tight text-[#f0594c] sm:text-xs"
          >
            {
              " _  __  ___  ____  _____    _\n| |/ / / _ \\|  _ \\|__  /   / \\\n| ' / | | | | |_) | / /   / _ \\\n| . \\ | |_| |  _ < / /_  / ___ \\\n|_|\\_\\ \\___/|_| \\_/____|/_/   \\_\\"
            }
          </pre>
          <span className="sr-only">Korza CLI</span>
          <p className="font-bold">Setup</p>
          <p>Let&apos;s get your tools ready.</p>
          <p className={muted}>5 tools</p>
          <div className="my-[1.75em]">
            <Group title="Essentials">
              <ToolRow
                name="Git & GitHub"
                status="Ready · 2.50.1"
                installed
                selected
                expandable
              />
              <ToolRow name="Homebrew" status="Ready · 7.0.1" installed />
            </Group>
            <Group title="AI tools">
              <ToolRow
                name="Claude Code"
                status="Ready · 2.1.270"
                installed
                expandable
              />
            </Group>
            <Group title="Languages">
              <ToolRow name="Python" status="Ready · uv 0.12.13" installed />
              <ToolRow name="Node.js" status="Ready · 24.21.0" installed />
            </Group>
          </div>
          <p className={ready}>✓ Your tools are ready.</p>
          <div className="mt-5 mb-4">
            <p>Next steps</p>
            <div className="pl-3">
              <p>Open a new terminal.</p>
              <p>
                Check your tools:{" "}
                <code className="whitespace-nowrap">korza doctor</code>
              </p>
              <p>
                Start Claude Code:{" "}
                <code className="whitespace-nowrap">claude</code>
              </p>
            </div>
          </div>
          <p className="mt-2 flex flex-wrap gap-x-[3ch] gap-y-1 overflow-hidden border-t border-[#7a7a82] pt-2 text-[#d9a441]">
            {[
              "↑↓ Move",
              "[Enter] Details",
              "[r] Edit",
              "[Escape] Finish",
              "[←/→] Collapse/expand",
              "[?] Help",
            ].map((action, index) => (
              <span key={action} className="relative whitespace-nowrap">
                {index > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -left-[2ch] text-[#7a7a82]"
                  >
                    |
                  </span>
                )}
                {action}
              </span>
            ))}
          </p>
        </div>
      </div>
      <figcaption className="sr-only">
        Example of completed setup. Versions may differ.
      </figcaption>
    </figure>
  );
}
