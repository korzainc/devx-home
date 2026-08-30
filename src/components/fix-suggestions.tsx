import type { FixBlock, UnwiredGap } from "@/lib/gap/fix";
import type { FixPatch } from "@/lib/gap/patch";
import { CopyButton } from "./copy-button";

// Renders the remedy half of the report. The unit here is the file edit, not the gap: one block
// can close four capabilities at once, so a per-gap disclosure would print the same twenty lines
// four times and misrepresent the size of the change. The header names what a block closes, and
// the categories below link back up to it.

const capabilityLabels: Record<string, string> = {
  secrets: "Secret Scanning",
  sast: "SAST",
  sca: "Dependency Scanning",
  "iac-config": "IaC Config",
  "iac-dockerfile-lint": "Dockerfile Lint",
  "image-scan": "Image Scanning",
  "lint-bugs": "Bug Patterns",
  "lint-style": "Style Linting",
  format: "Formatting",
  typecheck: "Type Checking",
  "unit-tests": "Unit Tests",
  "e2e-tests": "End-to-End Tests",
  coverage: "Coverage",
  "dependency-updates": "Dependency Updates",
};

function label(capability: string) {
  return capabilityLabels[capability] ?? capability;
}

/**
 * The diff. Added lines are marked by a `+` in the gutter and by the ink colour of the code, not
 * by a background wash alone - the report already spends green on "this check runs", and a full
 * wash would collide with that meaning as well as carrying it in colour only.
 */
function Diff({ patch }: { patch: FixPatch }) {
  return (
    <div className="overflow-x-auto">
      {/* Auto-translating a workflow file would rewrite its keys into another language and
          quietly produce YAML that no longer runs. */}
      <table
        translate="no"
        className="w-full border-collapse font-mono text-xs"
      >
        <tbody>
          {patch.lines.map((line, index) => (
            <tr
              key={`${line.number}-${index}`}
              className={line.kind === "added" ? "bg-positive-wash" : undefined}
            >
              {/* Line numbers are decoration for a screen reader: hearing "twelve, plus,
                  thirteen, plus" before every line makes the code unreadable. */}
              <td
                aria-hidden="true"
                className="w-10 shrink-0 border-r border-line px-2 py-0.5 text-right tabular-nums text-ink-faint select-none"
              >
                {line.number}
              </td>
              <td
                aria-hidden="true"
                className={`w-5 px-1.5 py-0.5 text-center select-none ${
                  line.kind === "added" ? "text-positive" : "text-ink-faint"
                }`}
              >
                {line.kind === "added" ? "+" : ""}
              </td>
              <td
                className={`py-0.5 pr-3 whitespace-pre ${
                  line.kind === "added" ? "text-ink" : "text-ink-faint"
                }`}
              >
                {line.text || " "}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Block({ block, patch }: { block: FixBlock; patch: FixPatch }) {
  const closes = block.capabilities.map(label);

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-line bg-surface-raised p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-medium text-ink text-pretty">{block.entryName}</h4>
        <span className="font-mono text-xs tabular-nums text-ink-faint">
          +{new Intl.NumberFormat().format(patch.addedCount)} lines
        </span>
      </div>

      <p className="text-sm text-ink-muted">
        Closes {closes.length} {closes.length === 1 ? "gap" : "gaps"}:{" "}
        <span className="text-ink">{closes.join(", ")}</span>.
      </p>

      {block.prerequisites.length > 0 ? (
        // A note, not a gate. People copy the block first and configure the repo second, so
        // hiding the YAML behind an unmet prerequisite would only get in the way.
        <p className="text-sm text-ink-muted">
          Set{" "}
          {block.prerequisites.map((name, index) => (
            <span key={name}>
              {index > 0 && ", "}
              <code translate="no" className="font-mono text-xs text-ink">
                {name}
              </code>
            </span>
          ))}{" "}
          under Settings → Secrets and variables → Actions before the first run.
        </p>
      ) : null}

      <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
          <span
            translate="no"
            className="min-w-0 truncate font-mono text-xs text-ink-muted"
          >
            {patch.mode === "create" ? "create " : ""}
            {patch.path}
          </span>
          {/* Before the code in DOM order, so reaching it by keyboard does not mean travelling
              through forty lines of YAML first. */}
          <CopyButton text={patch.clean} label={`the ${block.entryName} job`} />
        </div>
        <Diff patch={patch} />
      </div>
    </article>
  );
}

/** Gaps the catalogue names a tool for but does not yet say how to run. Prose, deliberately. */
function Unwired({ gaps }: { gaps: UnwiredGap[] }) {
  return (
    <p className="text-sm text-ink-muted">
      No wiring yet for{" "}
      <span className="text-ink">
        {gaps.map((gap) => label(gap.capability)).join(", ")}
      </span>
      . The catalogue names a tool for {gaps.length === 1 ? "it" : "these"} but
      does not describe how to run {gaps.length === 1 ? "it" : "them"} in CI, so
      there is nothing to suggest here yet.
    </p>
  );
}

export function FixSuggestions({
  blocks,
  patch,
  unwired,
}: {
  blocks: FixBlock[];
  patch: FixPatch | null;
  unwired: UnwiredGap[];
}) {
  if (blocks.length === 0 && unwired.length === 0) return null;

  return (
    <section className="flex flex-col gap-4 border-b border-line pb-8">
      <div className="flex flex-col gap-1">
        <h3 className="font-display text-lg font-semibold tracking-tight text-balance">
          Suggested fixes
        </h3>
        <p className="text-sm text-ink-muted">
          {patch?.mode === "create"
            ? "This repository has no workflow yet, so the fix is a new file."
            : "Add these jobs to the workflow named on each block."}{" "}
          Every line comes from the Korza catalogue, pinned to the version it
          names.
        </p>
      </div>

      {patch
        ? blocks.map((block) => (
            <Block key={block.entryId} block={block} patch={patch} />
          ))
        : null}

      {unwired.length > 0 ? <Unwired gaps={unwired} /> : null}
    </section>
  );
}
