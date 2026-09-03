import Link from "next/link";
import { FixPromptButton } from "@/components/fix-prompt";
import {
  alternatives,
  buildFixPrompt,
  clauses,
  isDisjunction,
  needsClauses,
  requirements,
  showAttribution,
} from "@/lib/gap/prompt";
import type {
  Analysis,
  BaselineStack,
  CapabilityReport,
} from "@/lib/gap/types";

// The report itself renders on the server and the disclosure at the bottom is a native `details`,
// so a report URL still reads with no client JavaScript. The one exception is the fix prompt
// control, which needs an overlay and the clipboard.

function StatusChip({
  status,
}: {
  status: "satisfied" | "partial" | "missing";
}) {
  return (
    <span
      className={`shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[0.65rem] ${
        status === "satisfied"
          ? "border-positive bg-positive-wash text-positive"
          : status === "partial"
            ? "border-partial bg-partial-wash text-partial"
            : "border-accent bg-accent-wash text-accent"
      }`}
    >
      {status === "satisfied"
        ? "present"
        : status === "partial"
          ? "partial"
          : "missing"}
    </span>
  );
}

// Renders two cases: genuine alternatives ("X or Y, and one is enough") and required-per-stack
// tools ("X for Go and Y for JavaScript"). `formatToParts` only gets tool names, never a
// compound "name for stack" string, which would render as one atomic part inside the link.
function RecommendedTools({
  tools,
  alwaysAttribute = false,
}: {
  tools: CapabilityReport["recommended"];
  /** Set by a caller rendering a capability that's already partially satisfied by another
   * stack's tool, so the reader needs this remaining tool's stack named explicitly, even
   * alone. */
  alwaysAttribute?: boolean;
}) {
  const formatter = isDisjunction(tools)
    ? alternatives
    : needsClauses(tools)
      ? clauses
      : requirements;
  const attribute = showAttribution(tools, alwaysAttribute);
  let cursor = 0;

  return (
    <>
      {formatter
        .formatToParts(tools.map((tool) => tool.name))
        .map((part, index) => {
          if (part.type === "literal") return part.value;

          const tool = tools[cursor++];
          return (
            <span key={index}>
              <Link
                href={`/tools/${tool.id}`}
                className="text-accent hover:underline"
              >
                {tool.name}
              </Link>
              {attribute && tool.stackLabels.length > 0
                ? ` for ${requirements.format(tool.stackLabels)}`
                : null}
            </span>
          );
        })}
    </>
  );
}

// analyze.ts asserts this itself before returning, so a real violation throws there and never
// reaches render. Kept as a second line of defense for any caller that builds a report by hand.
function unreachableRecommendedGap(capability: CapabilityReport): never {
  throw new Error(
    `Capability "${capability.id}" is unsatisfied with tools present but has no recommendation.`,
  );
}

function Capability({ capability }: { capability: CapabilityReport }) {
  const status = capability.satisfied
    ? "satisfied"
    : capability.present.length > 0
      ? "partial"
      : "missing";

  return (
    <div className="flex flex-col gap-2 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="font-medium text-ink">{capability.label}</h4>
        <StatusChip status={status} />
      </div>

      {status === "satisfied" ? (
        <ul className="flex flex-col gap-1">
          {(() => {
            const attribute = showAttribution(capability.present);
            return capability.present.map((tool) => (
              <li key={tool.id} className="text-sm text-ink-muted">
                {tool.name}
                {attribute && tool.stackLabels.length > 0
                  ? ` for ${requirements.format(tool.stackLabels)}`
                  : ""}{" "}
                <span className="font-mono text-xs text-ink-faint">
                  {tool.evidence}
                </span>
              </li>
            ));
          })()}
        </ul>
      ) : status === "partial" ? (
        capability.recommended.length > 0 ? (
          <>
            <ul className="flex flex-col gap-1">
              {capability.present.map((tool) => (
                <li key={tool.id} className="text-sm text-ink-muted">
                  {tool.name}
                  {tool.stackLabels.length > 0
                    ? ` for ${requirements.format(tool.stackLabels)}`
                    : ""}{" "}
                  <span className="font-mono text-xs text-ink-faint">
                    {tool.evidence}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-ink-muted">
              Still need{" "}
              <RecommendedTools
                tools={capability.recommended}
                alwaysAttribute
              />
              .
            </p>
          </>
        ) : (
          unreachableRecommendedGap(capability)
        )
      ) : capability.recommended.length > 0 ? (
        // A multi-tool line says outright that one of them is enough only when they are genuine
        // alternatives - a per-stack line lists tools that are each required, not a choice.
        <p className="text-sm text-ink-muted">
          Nothing found. The catalogue recommends{" "}
          <RecommendedTools tools={capability.recommended} />
          {isDisjunction(capability.recommended) &&
          capability.recommended.length > 1
            ? ", and one is enough."
            : "."}
        </p>
      ) : (
        <p className="text-sm text-ink-muted">
          Nothing found, and the catalogue has no tool for this stack yet.
        </p>
      )}
    </div>
  );
}

export function GapReport({
  analysis,
  stacks,
}: {
  analysis: Analysis;
  stacks: BaselineStack[];
}) {
  const expected = analysis.satisfiedCount + analysis.gapCount;
  // The real baseline has no "universal" capability - every one belongs to some ecosystem's own
  // baseline, so `expected` is zero only when no recognized stack matched.
  //
  // Checked as `expected === 0` rather than `analysis.stacks.length === 0`: the two currently
  // always agree, but this is the version that stays correct if a future baseline ever adds a
  // stack with no expected capabilities.
  const noStackDetected = expected === 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 border-b border-line pb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <span className="font-mono text-sm text-ink">{analysis.repo}</span>
          <span className="font-mono text-xs text-ink-faint">
            {analysis.defaultBranch}
          </span>
        </div>

        {noStackDetected ? (
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            No recognized stack was detected.
          </h2>
        ) : (
          <>
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              {analysis.satisfiedCount} of {expected} recommended checks are
              running
              {analysis.partialCount > 0
                ? `, plus ${analysis.partialCount} partially covered`
                : ""}
              .
            </h2>

            {/* The proportion lands before the numbers do. Green, amber, and red mirror the
                chips below: what runs, what's partial, and what doesn't. */}
            <div className="flex h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className="bg-positive"
                style={{
                  width: `${(analysis.satisfiedCount / expected) * 100}%`,
                }}
              />
              <div
                className="bg-partial"
                style={{
                  width: `${(analysis.partialCount / expected) * 100}%`,
                }}
              />
              <div className="flex-1 bg-accent" />
            </div>
          </>
        )}

        {/* The control sits on the summary row rather than above the gaps, so it reads as part of
            the report rather than an advert bolted onto it. Nothing to fix means nothing to
            generate, so a clean repo does not get offered one. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            {noStackDetected ? (
              <>
                No manifest for a stack the catalogue covers (
                {stacks.map((stack) => stack.label).join(", ")}) was found at
                the repo root, so nothing could be compared.
              </>
            ) : (
              <>
                Compared against the baseline for{" "}
                <span className="text-ink">
                  {analysis.stacks.map((stack) => stack.label).join(", ")}
                </span>
                . {analysis.filesRead.length} files read.
              </>
            )}
          </p>
          {analysis.gapCount > 0 ? (
            <FixPromptButton prompt={buildFixPrompt(analysis)} />
          ) : null}
        </div>
      </div>

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
