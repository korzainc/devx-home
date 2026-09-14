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
    <div className="grid grid-cols-[minmax(0,1fr)_16ch] gap-x-3 sm:grid-cols-[minmax(0,26ch)_minmax(0,1fr)]">
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
      <span className={installed ? ready : muted}>{status}</span>
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
        className="overflow-x-auto rounded-lg border border-white/10 bg-[#0e0e10] px-3 py-5 font-mono text-[12.5px] leading-[1.75] text-[#d6d6d6] sm:px-6 sm:py-[22px] sm:text-sm"
      >
        <div className="max-w-[60ch]">
          <p>
            <span className="text-[#e5484d]">◆ Korza CLI</span>{" "}
            <span className={muted}>· Setup</span>
          </p>
          <p>This tool is ready. Enter shows details.</p>
          <p className={muted}>5 tools</p>
          <div className="my-[1.75em]">
            <Group title="Essentials">
              <ToolRow name="Git & GitHub" status="Set up" expandable />
              <ToolRow name="Homebrew" status="Ready · 6.0.22" installed />
            </Group>
            <Group title="AI tools">
              <ToolRow
                name="Claude Code"
                status="Ready · 2.1.263"
                installed
                selected
                expandable
              />
            </Group>
            <Group title="Languages">
              <ToolRow name="Python" status="Install Python" />
              <ToolRow name="Node.js" status="Install Node LTS" />
            </Group>
            <p className={muted}>2 ready</p>
          </div>
          <p>Get help writing and reviewing code.</p>
          <p className="mt-2 flex flex-wrap gap-x-[1ch] border-t border-[#7a7a82] pt-2 text-[#d9a441]">
            {[
              "↑↓ Move",
              "Enter Details",
              "r Reinstall",
              "Esc Finish",
              "? Help",
            ].map((action, index) => (
              <span key={action} className="whitespace-nowrap">
                {index > 0 && <span aria-hidden>· </span>}
                {action}
              </span>
            ))}
          </p>
        </div>
      </div>
    </figure>
  );
}
