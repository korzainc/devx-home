/**
 * The vocabulary as one line: each term, its plain-words gloss, and `⊃` between them to carry
 * the containment.
 *
 * One implementation for both callers: the catalogue header and the foot of the intro page.
 * Each passes its own terms, because the useful set differs. The catalogue omits
 * `marketplace`, since nothing on that page asks the reader to think about one.
 */
export function SkillsGlossaryLine({
  terms,
  className = "",
}: {
  terms: [string, string][];
  /** Wrapper styling: the intro page centres this under a rule, the catalogue does not. */
  className?: string;
}) {
  return (
    <p
      className={`flex flex-wrap items-baseline gap-x-2 gap-y-1.5 ${className}`}
    >
      {terms.map(([term, gloss], index) => (
        <span key={term} className="flex items-baseline gap-2">
          {index > 0 ? (
            <span aria-hidden="true" className="mr-1 font-mono text-accent">
              ⊃
            </span>
          ) : null}
          {/* Relative to the line, not a fixed rem: the catalogue sets this line larger than
              the intro page does, and the mono term should scale with whichever it is. At a
              fixed size it read as small mono pasted into normal text. */}
          <span className="font-mono text-[0.9em] text-ink">{term}</span>
          <span>{gloss}</span>
        </span>
      ))}
    </p>
  );
}
