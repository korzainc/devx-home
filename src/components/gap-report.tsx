import Link from "next/link";
import type { Analysis, CapabilityReport } from "@/lib/gap/types";

// Nothing here is interactive: the disclosure at the bottom is a native `details`. So the whole
// report renders on the server, and a report URL works with no client JavaScript at all.

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
        <p className="text-sm text-ink-muted">
          Nothing found. The catalogue recommends{" "}
          {capability.recommended.map((tool, index) => (
            <span key={tool.id}>
              {index > 0 && ", "}
              <Link
                href={`/tools/${tool.id}`}
                className="text-accent hover:underline"
              >
                {tool.name}
              </Link>
            </span>
          ))}
          .
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
              running.
            </h2>

            {/* The proportion lands before the numbers do. Green is what runs, red is what does
                not, which is the same pairing the chips below use. */}
            <div className="flex h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className="bg-positive"
                style={{
                  width: `${(analysis.satisfiedCount / expected) * 100}%`,
                }}
              />
              <div className="flex-1 bg-accent" />
            </div>
          </>
        )}

        <p className="text-sm text-ink-muted">
          {noStackDetected ? (
            <>
              No manifest for a stack the catalogue covers (Java, JavaScript,
              TypeScript, Go, Python, Docker) was found at the repo root, so
              nothing could be compared.
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
