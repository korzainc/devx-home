import type { Metadata } from "next";
import { GettingStartedEntrance } from "@/components/getting-started-entrance";
import { CommandGroup } from "@/components/install-panel";
import { TerminalPreview } from "@/components/terminal-preview";
import { PreviewInstallCommand } from "@/components/preview-install";
import { bootstrapCommand } from "@/lib/bootstrap-command";
import { getSetupOrigin } from "@/lib/setup-origin";
import { faq, manualCommands } from "@/lib/getting-started";

export const metadata: Metadata = {
  title: "Getting started",
  description:
    "Set up your Mac with Korza CLI, or follow the manual instructions.",
};

function ManualNote({ note }: { note: string | string[] }) {
  const style = "max-w-2xl text-sm text-ink-muted [overflow-wrap:anywhere]";
  return Array.isArray(note) ? (
    <ul className={`${style} list-disc space-y-2 pl-4`}>
      {note.map((instruction) => (
        <li key={instruction}>{instruction}</li>
      ))}
    </ul>
  ) : (
    <p className={style}>{note}</p>
  );
}

const cta = "text-sm font-medium text-accent hover:underline";

export default function GettingStartedPage() {
  const origin = getSetupOrigin();
  const command = origin ? bootstrapCommand(`${origin}/setup`) : null;
  return (
    <div className="getting-started flex w-full flex-col">
      <GettingStartedEntrance />
      <section className="grid grid-cols-1 items-center gap-8 pb-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
        <div className="gs-hero-copy flex flex-col gap-4">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Install Korza CLI <br />
            in one command.
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-ink-muted">
            Run this command in Terminal on your Mac, then follow the prompts.
          </p>
        </div>

        <div className="gs-hero-command flex w-full min-w-0 flex-col gap-3">
          <PreviewInstallCommand key={command} command={command} />
          <a href="#manual" className={cta}>
            Set up manually
          </a>
        </div>
      </section>

      <section className="hidden grid-cols-1 gap-8 border-t border-line py-12 md:grid">
        <div className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Guided setup.
          </h2>
          <p className="text-ink-muted">
            Choose your tools. Korza CLI guides you through setup.
          </p>
          <a href="#questions" className={cta}>
            Need help?
          </a>
        </div>
        <TerminalPreview />
      </section>

      <section
        id="manual"
        className="grid grid-cols-1 gap-8 scroll-mt-20 border-t border-line py-12"
      >
        <div className="flex max-w-2xl flex-col gap-3">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Set up manually
          </h2>
          <p className="text-ink-muted">
            Expand a tool for setup commands. Follow the prompts and open a new
            terminal when asked.
          </p>
        </div>
        <div className="w-full min-w-0 rounded-xl border border-line bg-surface">
          {manualCommands.map((entry) => (
            <details
              key={entry.title}
              className="group border-b border-line last:border-b-0 open:bg-surface-raised"
            >
              <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-5 py-3 text-ink md:grid-cols-[max-content_minmax(0,1fr)_minmax(0,2fr)] md:items-center md:gap-x-5 [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="font-mono text-accent">
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
                <span className="font-mono text-sm">{entry.tool}</span>
                <span className="col-start-2 text-xs text-ink-muted md:col-start-3 md:text-right">
                  {entry.why}
                </span>
              </summary>
              <div className="flex flex-col gap-2 border-t border-line px-5 py-4">
                {entry.installUrl && (
                  <a href={entry.installUrl} className={cta}>
                    Install {entry.tool} →
                  </a>
                )}
                {entry.noteFirst && <ManualNote note={entry.note} />}
                <CommandGroup
                  commands={entry.commands}
                  comments={entry.comments}
                  breakBefore={entry.breakBefore}
                />
                {!entry.noteFirst && <ManualNote note={entry.note} />}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section
        id="questions"
        className="scroll-mt-20 border-t border-dashed border-line py-12"
      >
        <h2 className="mb-8 font-display text-2xl font-semibold tracking-tight">
          Questions
        </h2>
        <div className="flex w-full flex-col">
          {faq.map((entry) => (
            <details
              key={entry.q}
              className="group border-b border-dashed border-line py-3 last:border-b-0"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 text-ink [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="font-mono text-accent">
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
                {entry.q}
              </summary>
              <p className="pt-2 pl-6 text-sm text-ink-muted">{entry.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
