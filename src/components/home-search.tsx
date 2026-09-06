"use client";

import { useId } from "react";

/**
 * The home page's search field.
 *
 * A plain GET form: submitting sends the query to /search, which runs the ranking server-side and
 * renders the results page.
 */

const EXAMPLES = [
  "review a pull request",
  "scan for secrets",
  "write documentation",
  "set up type checking",
];

export function HomeSearch() {
  const inputId = useId();

  return (
    <div className="relative w-full max-w-2xl">
      <form action="/search" role="search" className="relative">
        <label htmlFor={inputId} className="sr-only">
          Search skills and CI tools
        </label>

        {/* The bloom, not a ring: a red outline on a field this large reads as a validation
            error. Sits behind the input and only while focused. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -inset-x-6 -inset-y-4 -z-10 rounded-full bg-accent/15 opacity-0 blur-3xl transition-opacity duration-300 has-focus-visible:opacity-100 peer-focus:opacity-100"
        />

        <span
          aria-hidden
          className="absolute top-1/2 left-5 -translate-y-1/2 text-ink-faint"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <circle
              cx="11"
              cy="11"
              r="7"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="m20 20-3.5-3.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </span>

        <input
          id={inputId}
          name="q"
          type="search"
          placeholder="Describe what you’re trying to do…"
          autoComplete="off"
          spellCheck={false}
          className="peer w-full rounded-2xl border border-line bg-surface py-4 pr-5 pl-13 text-base text-ink transition-colors placeholder:text-ink-faint focus:border-line-strong focus:bg-surface-raised"
        />
      </form>

      {/* At rest the examples do the teaching: they are sentences, which is what the field wants,
          and they are links straight to results rather than decoration. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-faint">Try</span>
        {EXAMPLES.map((example) => (
          <a
            key={example}
            href={`/search?q=${encodeURIComponent(example)}`}
            className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            {example}
          </a>
        ))}
      </div>
    </div>
  );
}
