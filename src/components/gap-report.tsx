import Link from "next/link";
import { FixPromptButton } from "@/components/fix-prompt";
import { alternatives, buildFixPrompt } from "@/lib/gap/prompt";
import type { Analysis, CapabilityReport } from "@/lib/gap/types";
import { FixSuggestions } from "./fix-suggestions";

// The report itself renders on the server and the disclosure at the bottom is a native `details`,
// so a report URL still reads with no client JavaScript. The one exception is the fix prompt
// control, which needs an overlay and the clipboard.

function StatusChip({ satisfied }: { satisfied: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[0.65rem] ${
        satisfied
          ? "border-positive bg-positive-wash text-positive"
          : "border-accent bg-accent-wash text-accent"
      }`}
    >
      {satisfied ? "present" : "missing"}
    </span>
  );
}

// The same disjunction the prompt uses, rendered as links instead of text. `formatToParts` keeps
// the separators in one place: hand-rolling `or` here is how the two drift apart. Elements come
// back in input order, so a cursor pairs each one with the tool it was formatted from.
function Alternatives({ tools }: { tools: CapabilityReport["recommended"] }) {
  let cursor = 0;

  return (
    <>
      {alternatives
        .formatToParts(tools.map((tool) => tool.name))
        .map((part, index) => {
          if (part.type === "literal") return part.value;

          const tool = tools[cursor++];
          return (
            <Link
              key={index}
              href={`/tools/${tool.id}`}
              className="text-accent hover:underline"
            >
              {tool.name}
            </Link>
          );
        })}
    </>
  );
}

function Capability({ capability }: { capability: CapabilityReport }) {
  return (
    <div className="flex flex-col gap-2 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="font-medium text-ink">{capability.label}</h4>
        <StatusChip satisfied={capability.satisfied} />
      </div>

      {capability.satisfied ? (
        <ul className="flex flex-col gap-1">
          {capability.present.map((tool) => (
            <li key={tool.id} className="text-sm text-ink-muted">
              {tool.name}{" "}
              <span className="font-mono text-xs text-ink-faint">
                {tool.evidence}
              </span>
            </li>
          ))}
        </ul>
      ) : capability.recommended.length > 0 ? (
        // The tools listed are alternatives, not a shopping list, so a multi-tool line says
        // outright that one of them is enough.
        <p className="text-sm text-ink-muted">
          Nothing found. The catalogue recommends{" "}
          <Alternatives tools={capability.recommended} />
          {capability.recommended.length > 1 ? ", and one is enough." : "."}
        </p>
      ) : (
        <p className="text-sm text-ink-muted">
          Nothing found, and the catalogue has no tool for this stack yet.
        </p>
      )}
    </div>
  );
}

export function GapReport({ analysis }: { analysis: Analysis }) {
  const expected = analysis.satisfiedCount + analysis.gapCount;
  // A repo the catalogue has no baseline for has not failed anything - it has not been
  // assessed. Reporting "0 of 0" against a full red bar would read as the opposite.
  //
  // Checked as `expected === 0` rather than `analysis.stacks.length === 0`: the two currently
  // always agree, but this is the version that stays correct if a future baseline ever adds a
  // stack with no expected capabilities.
  const assessed = expected > 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 border-b border-line pb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="font-mono text-sm text-ink">{analysis.repo}</span>
          <span className="font-mono text-xs text-ink-faint">
            {analysis.defaultBranch}
          </span>
        </div>

        <h2 className="font-display text-2xl font-semibold tracking-tight text-balance">
          {assessed
            ? `${analysis.satisfiedCount} of ${expected} recommended checks are running.`
            : "No baseline applies to this repository yet."}
        </h2>

        {/* The proportion lands before the numbers do. Green is what runs, red is what does
            not, which is the same pairing the chips below use. Nothing to prove means no bar:
            an empty track says "not measured" where a red one would say "all failing". */}
        {assessed ? (
          <div className="flex h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="bg-positive"
              style={{
                width: `${(analysis.satisfiedCount / expected) * 100}%`,
              }}
            />
            <div className="flex-1 bg-accent" />
          </div>
        ) : null}

        {/* The control sits on the summary row rather than above the gaps, so it reads as part of
            the report rather than an advert bolted onto it. Nothing to fix means nothing to
            generate, so a clean repo does not get offered one. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            {analysis.stacks.length > 0 ? (
              <>
                Compared against the baseline for{" "}
                <span className="text-ink">
                  {analysis.stacks.map((stack) => stack.label).join(", ")}
                </span>
                . {analysis.filesRead.length} files read.
              </>
            ) : (
              <>
                The catalogue publishes a baseline for Java only, so there is
                nothing yet to compare this repository against.{" "}
                {analysis.filesRead.length} files read.
              </>
            )}
          </p>
          {analysis.gapCount > 0 ? (
            <FixPromptButton prompt={buildFixPrompt(analysis)} />
          ) : null}
        </div>
      </div>

      <FixSuggestions
        blocks={analysis.fixes.blocks}
        patch={analysis.fixes.patch}
        unwired={analysis.fixes.unwired}
      />

      {analysis.categories.map((category) => (
        <section key={category.category} className="flex flex-col gap-1">
          <h3 className="text-xs font-medium text-ink-faint">
            {category.category}
          </h3>
          <div className="divide-y divide-line">
            {category.capabilities.map((capability) => (
              <Capability key={capability.id} capability={capability} />
            ))}
          </div>
        </section>
      ))}

      <details className="border-t border-line pt-6">
        <summary className="cursor-pointer text-sm text-ink-muted hover:text-ink">
          Files read from the repo ({analysis.filesRead.length})
        </summary>
        <ul className="mt-3 flex flex-col gap-1 font-mono text-xs text-ink-faint">
          {analysis.filesRead.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
