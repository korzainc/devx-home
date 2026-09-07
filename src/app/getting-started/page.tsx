import type { Metadata } from "next";
import { CommandField } from "@/components/install-panel";
import { PreviewInstallCommand } from "@/components/preview-install";
import {
  faq,
  manualCommands,
  manualTools,
  walkthrough,
} from "@/lib/getting-started";

export const metadata: Metadata = {
  title: "Getting started",
  description:
    "From a new Mac to a working Korza toolchain in one command, with the manual steps for anyone who would rather run them.",
};

/* The two-column rhythm the home page uses: a data card beside the prose that explains it. */
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
      className="grid scroll-mt-20 items-center gap-8 border-t border-line py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14"
    >
      <div className="rounded-xl border border-line bg-surface">{card}</div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

const row = "flex items-baseline gap-4 border-b border-line px-5 py-3 text-sm";
const caption = "px-5 pt-3 pb-4 text-xs text-ink-faint";
const cta = "text-sm font-medium text-accent hover:underline";

export default function GettingStartedPage() {
  return (
    <div className="flex flex-col">
      {/* The command sits beside the headline rather than under it, so it is on screen on load. */}
      <section className="grid items-center gap-8 pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
        <div className="relative isolate flex flex-col gap-4">
          <span
            aria-hidden
            className="absolute -top-10 -left-12 -z-10 h-36 w-96 rounded-full bg-accent/20 blur-3xl"
          />
          <h1 className="font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            A working toolchain, in one command.
          </h1>
          <p className="max-w-lg text-lg leading-relaxed text-ink-muted">
            Checks this machine and installs what is missing. macOS to start,
            and here is exactly what to expect, plus what to do if you would
            rather run each step yourself.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <PreviewInstallCommand />

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
              the two sign-ins. Safe to run again anytime.
            </p>
          </>
        }
      >
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Handled for you, in order.
        </h2>
        <p className="text-ink-muted">
          You will not be asked to install anything by hand. The binary reads
          your machine, tells you the plan, and pauses only for the two things
          on the left.
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
            <ul className="flex flex-col">
              {manualTools.map((entry) => (
                <li key={entry.tool} className={`${row} last:border-b-0`}>
                  <span className="font-mono text-ink">{entry.tool}</span>
                  <span className="ml-auto text-right text-xs text-ink-faint">
                    {entry.why}
                  </span>
                </li>
              ))}
            </ul>
            <p className={caption}>
              Proposed order. This is what the binary above would handle for
              you.
            </p>
          </>
        }
      >
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Prefer to run each step yourself?
        </h2>
        <p className="text-ink-muted">
          Every step the binary performs is a normal command you can run on its
          own. Nothing here needs the binary to work, and this is today&apos;s
          actual path until it ships.
        </p>
        <p className="text-ink-muted">
          The result is the same either way, one managed block in{" "}
          <code className="font-mono text-sm">~/.zshrc</code>, nothing else in
          that file touched.
        </p>
        <p className="text-sm text-ink-faint">
          Open any tool below for the exact commands. These are also where a
          failed step in the installer sends you, so they have to exist either
          way.
        </p>
      </Pair>

      {/* Closed by default, so the page still leads with one command rather than six. */}
      <div className="flex flex-col pb-12">
        {manualCommands.map((entry) => (
          <details
            key={entry.title}
            className="group border-b border-line open:bg-surface"
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 text-ink [&::-webkit-details-marker]:hidden">
              <span aria-hidden className="font-mono text-accent">
                <span className="group-open:hidden">+</span>
                <span className="hidden group-open:inline">−</span>
              </span>
              {entry.title}
            </summary>
            <div className="flex flex-col gap-2 px-4 pb-4">
              {entry.commands.map((command) => (
                <CommandField key={command} label="Terminal" value={command} />
              ))}
              <p className="max-w-2xl pt-1 text-sm text-ink-muted">
                {entry.note}
              </p>
            </div>
          </details>
        ))}
      </div>

      <section
        id="questions"
        className="scroll-mt-20 border-t border-line py-12"
      >
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          Questions
        </h2>
        {/* Same closed-by-default disclosure as the manual steps above, so seven
            answers do not outweigh the one command this page leads with. */}
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
