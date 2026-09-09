import type { Metadata } from "next";
import { CommandField } from "@/components/install-panel";
import { PreviewInstallCommand } from "@/components/preview-install";
import { bootstrapCommand } from "@/lib/bootstrap-command";
import { getSetupOrigin } from "@/lib/setup-origin";
import { faq, manualCommands, walkthrough } from "@/lib/getting-started";

export const metadata: Metadata = {
  title: "Getting started",
  description:
    "Install devx in one command, then follow the guided Korza toolchain setup or run each step yourself.",
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
      className="grid scroll-mt-20 grid-cols-1 items-center gap-8 border-t border-line py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14"
    >
      <div className="min-w-0 rounded-xl border border-line bg-surface">
        {card}
      </div>
      <div className="min-w-0 flex flex-col gap-3">{children}</div>
    </section>
  );
}

const row = "flex items-baseline gap-4 border-b border-line px-5 py-3 text-sm";
const caption = "px-5 pt-3 pb-4 text-xs text-ink-faint";
const cta = "text-sm font-medium text-accent hover:underline";

export default function GettingStartedPage() {
  const origin = getSetupOrigin();
  const command = origin ? bootstrapCommand(`${origin}/setup`) : null;
  return (
    <div className="flex flex-col">
      <section className="grid grid-cols-1 items-center gap-8 pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
        <div className="relative isolate flex flex-col gap-4">
          <span
            aria-hidden
            className="absolute -top-10 -left-12 -z-10 h-36 w-96 max-w-full rounded-full bg-accent/20 blur-3xl"
          />
          <h1 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Install devx in one command.
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-ink-muted">
            Then run the exact setup command printed by the installer to check
            this machine and install what is missing. macOS to start, with the
            manual steps available if you prefer them.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <PreviewInstallCommand key={command} command={command} />
          <p className="text-xs text-ink-faint">Pre-release macOS build.</p>

          <a href="#manual" className={cta}>
            Prefer to run each step yourself? ↓
          </a>
        </div>
      </section>

      <Pair
        card={
          <>
            <ol className="flex flex-col">
              {walkthrough.map((step, index) => (
                <li key={step.does} className={`${row} last:border-b-0`}>
                  <span className="font-mono text-xs text-accent">
                    {index + 1}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-ink">{step.does}</span>
                    <span className="text-xs text-ink-muted">
                      {step.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            <p className={caption}>
              How long it takes depends on what is missing, your network, and
              the required sign-ins. You choose which tools to set up.
            </p>
          </>
        }
      >
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Guided setup.
        </h2>
        <p className="text-ink-muted">
          devx checks your machine and helps install and configure the tools you
          choose. Sign-ins and administrator prompts stay in your terminal or
          browser.
        </p>
        <p className="text-ink-muted">
          If a step cannot finish, for example because access needs someone
          else&apos;s approval, it says so and moves on rather than stopping the
          run.
        </p>
        <a href="#questions" className={cta}>
          What if something fails, see the questions →
        </a>
        <a href="#manual" className={cta}>
          Prefer to do this by hand instead? Skip to the manual steps ↓
        </a>
      </Pair>

      <Pair
        id="manual"
        card={
          <>
            {manualCommands.map((entry) => (
              <details
                key={entry.title}
                className="group border-b border-line last:border-b-0 open:bg-canvas"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 text-ink [&::-webkit-details-marker]:hidden">
                  <span aria-hidden className="font-mono text-accent">
                    <span className="group-open:hidden">+</span>
                    <span className="hidden group-open:inline">−</span>
                  </span>
                  <span className="font-mono text-sm">{entry.tool}</span>
                  <span className="ml-auto text-right text-xs text-ink-faint">
                    {entry.why}
                  </span>
                </summary>
                <div className="flex flex-col gap-2 border-t border-line px-5 py-4">
                  {entry.noteFirst && (
                    <p className="max-w-2xl text-sm text-ink-muted [overflow-wrap:anywhere]">
                      {entry.note}
                    </p>
                  )}
                  {entry.commands.map((command) => (
                    <CommandField
                      key={command}
                      label="Terminal"
                      value={command}
                    />
                  ))}
                  {!entry.noteFirst && (
                    <p className="max-w-2xl pt-1 text-sm text-ink-muted [overflow-wrap:anywhere]">
                      {entry.note}
                    </p>
                  )}
                </div>
              </details>
            ))}
            <p className={caption}>
              Manual alternatives for the tools available in devx setup.
            </p>
          </>
        }
      >
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Prefer to run each step yourself?
        </h2>
        <p className="text-ink-muted">
          Use these commands to set up the tools independently of devx.
        </p>
        <p className="text-ink-muted">
          The manual installers manage their own shell configuration. Follow
          each tool&apos;s instructions to update your PATH and open a new
          terminal when needed.
        </p>
        <p className="text-sm text-ink-faint">
          Open a tool for its commands and prerequisites.
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
