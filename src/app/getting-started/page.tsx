import type { Metadata } from "next";
import { CommandField } from "@/components/install-panel";
import { PreviewInstallCommand } from "@/components/preview-install";
import { bootstrapCommand } from "@/lib/bootstrap-command";
import { getSetupOrigin } from "@/lib/setup-origin";
import { faq, manualCommands } from "@/lib/getting-started";

export const metadata: Metadata = {
  title: "Getting started",
  description:
    "Set up your Mac with Korza CLI, or follow the manual instructions.",
};

function Pair({
  id,
  card,
  children,
}: {
  id?: string;
  card: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      // scroll-mt clears the sticky header when an anchor link lands here.
      className="grid scroll-mt-20 grid-cols-1 items-center gap-8 border-t border-line py-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-14"
    >
      <div className="min-w-0 rounded-xl border border-line bg-surface lg:order-2">
        {card}
      </div>
      <div className="order-first flex min-w-0 flex-col gap-3 lg:sticky lg:top-24">
        {children}
      </div>
    </section>
  );
}

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
    <div className="getting-started flex flex-col">
      <section className="grid grid-cols-1 items-center gap-8 pb-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-14">
        <div className="relative isolate flex flex-col gap-4">
          <span
            aria-hidden
            className="absolute -top-10 -left-12 -z-10 h-36 w-96 max-w-full rounded-full bg-accent/20 blur-3xl"
          />
          <h1 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Install Korza CLI <br />
            in one command.
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-ink-muted">
            Run this command in Terminal on your Mac. Follow the
            installer&apos;s instructions to start setup.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <PreviewInstallCommand key={command} command={command} />
          <a href="#manual" className={cta}>
            Set up manually ↓
          </a>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-8 border-t border-line py-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-14">
        <figure className="min-w-0 rounded-xl border border-[#e5484d]/25 bg-[linear-gradient(135deg,#2a1214,#161014)] p-5 lg:order-2">
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#0e0e10] px-6 py-[22px]">
            <pre
              aria-label="Example Korza CLI setup screen"
              className="m-0 font-mono text-[12.5px] leading-[1.75] whitespace-pre text-[#d6d6d6]"
            >
              <span className="text-[#e5484d]">{"◆ Korza CLI"}</span>{" "}
              <span className="text-[#7a7a82]">{"· Setup"}</span>
              <br />
              {"This tool is ready. Enter shows details."}
              <br />
              <span className="text-[#7a7a82]">{"5 tools"}</span>
              <br />
              <br />
              <span className="text-[#7a7a82]">{"── Essentials"}</span>
              <br />
              {"  "}
              <span className="text-[#d9a441]">{"●"}</span>
              {" Git & GitHub ▸        "}
              <span className="text-[#7a7a82]">{"Set up"}</span>
              <br />
              {"  "}
              <span className="text-[#5fd07a]">{"✓"}</span>
              {" Homebrew              "}
              <span className="text-[#5fd07a]">{"Ready · 6.0.22"}</span>
              <br />
              <span className="text-[#7a7a82]">{"── AI tools"}</span>
              <br />
              <span className="text-[#e5484d]">{"❯"}</span>{" "}
              <span className="text-[#5fd07a]">{"✓"}</span>{" "}
              <b>{"Claude Code"}</b>
              {" ▸         "}
              <span className="text-[#5fd07a]">{"Ready · 2.1.263"}</span>
              <br />
              <span className="text-[#7a7a82]">{"── Languages"}</span>
              <br />
              {"  "}
              <span className="text-[#d9a441]">{"●"}</span>
              {" Python                "}
              <span className="text-[#7a7a82]">{"Install Python"}</span>
              <br />
              {"  "}
              <span className="text-[#d9a441]">{"●"}</span>
              {" Node.js               "}
              <span className="text-[#7a7a82]">{"Install Node LTS"}</span>
              <br />
              <span className="text-[#7a7a82]">{"2 ready"}</span>
              <br />
              <br />
              {"Get help writing and reviewing code."}
              <br />
              <span className="text-[#7a7a82]">
                {"────────────────────────────────────────────────────────────"}
              </span>
              <br />
              <span className="text-[#d9a441]">
                {"↑↓ Move · Enter Details · r Reinstall · Esc Finish · ? Help"}
              </span>
            </pre>
          </div>
        </figure>
        <div className="order-first flex min-w-0 flex-col gap-3 lg:sticky lg:top-24">
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Guided setup.
          </h2>
          <p className="text-ink-muted">
            Choose your tools. Korza CLI guides you through setup.
          </p>
          <a href="#questions" className={cta}>
            Need help? →
          </a>
        </div>
      </section>

      <Pair
        id="manual"
        card={
          <>
            {manualCommands.map((entry) => (
              <details
                key={entry.title}
                className="group border-b border-line last:border-b-0 open:bg-canvas"
              >
                <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 px-5 py-3 text-ink [&::-webkit-details-marker]:hidden">
                  <span aria-hidden className="font-mono text-accent">
                    <span className="group-open:hidden">+</span>
                    <span className="hidden group-open:inline">−</span>
                  </span>
                  <span className="font-mono text-sm">{entry.tool}</span>
                  <span className="col-start-2 text-xs text-ink-muted">
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
                  {entry.commands.map((command) => (
                    <CommandField
                      key={command}
                      label="Terminal"
                      value={command}
                    />
                  ))}
                  {!entry.noteFirst && <ManualNote note={entry.note} />}
                </div>
              </details>
            ))}
          </>
        }
      >
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Set up manually
        </h2>
        <p className="text-ink-muted">
          Open a tool to see its setup commands. Follow the installer&apos;s
          instructions. Open a new terminal when asked.
        </p>
      </Pair>

      <section
        id="questions"
        className="scroll-mt-20 border-t border-line py-12"
      >
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Questions
        </h2>
        <div className="flex max-w-3xl flex-col pt-2">
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
