"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import {
  groupHits,
  SearchGroupHeading,
  SearchResultRow,
  type SearchHit,
} from "@/components/search-results";

/**
 * The home page's search field, and the results that drop out of it.
 *
 * A combobox rather than a command palette: the palette pattern serves people who already know
 * the vocabulary, and this field exists for the person who does not know Korza has a skill for
 * what they are about to describe. Suggestions are the destinations themselves, not query
 * completions - there is nothing on the far side of a completion to search.
 *
 * Wrapped in a real GET form, so submitting works with no JavaScript at all: the field falls back
 * to /search, which runs the same ranking on the server.
 */

const DEBOUNCE_MS = 250;

/** Below this a query is all noise, and the dropdown flickers on every keystroke. */
const MIN_QUERY = 2;

/** Long enough that a fast answer never flashes a skeleton. */
const SPINNER_AFTER_MS = 300;

const EXAMPLES = [
  "review a pull request",
  "scan for secrets",
  "write documentation",
  "set up type checking",
];

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; hits: SearchHit[]; query: string }
  | { status: "failed" };

export function HomeSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [open, setOpen] = useState(false);
  // -1 means "nothing chosen": Enter then submits the query rather than opening a row, which is
  // what a user who typed a sentence and never touched the arrows expects.
  const [active, setActive] = useState(-1);
  const [slow, setSlow] = useState(false);

  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const trimmed = query.trim();

  useEffect(() => {
    // Below the minimum there is nothing to fetch. `state` is not reset here: the panel is gated
    // on the query length anyway, and setting state from an effect body only to describe what the
    // query already says causes a second render for no gain.
    if (trimmed.length < MIN_QUERY) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState({ status: "loading" });
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { results: SearchHit[] };
        setState({ status: "ready", hits: body.results, query: trimmed });
        setActive(-1);
      } catch (error) {
        // An aborted request is the expected outcome of typing another character.
        if (controller.signal.aborted) return;
        console.error(error);
        setState({ status: "failed" });
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [trimmed]);

  // The skeleton is worth showing only for a query slow enough to notice. Both writes happen in
  // callbacks - the timer, and the cleanup that runs when the query settles - so neither is a
  // synchronous setState in the effect body.
  useEffect(() => {
    if (state.status !== "loading") return;
    const timer = setTimeout(() => setSlow(true), SPINNER_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [state.status]);

  // A click outside closes the list without clearing what was typed.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // Pinned to the current query, so shortening the field back below the minimum cannot leave the
  // previous query's rows on screen.
  const fresh = state.status === "ready" && state.query === trimmed;
  const hits = fresh ? state.hits : [];
  const groups = groupHits(hits);
  // Flattened in render order, so the arrow keys walk the rows as they appear rather than as they
  // arrived from the API.
  const ordered = groups.flatMap((group) => group.hits);
  const showPanel = open && trimmed.length >= MIN_QUERY;

  function go(hit: SearchHit) {
    setOpen(false);
    router.push(hit.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      // Closes the list and keeps the text, per the combobox pattern.
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!ordered.length) return;
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      // Wraps through -1, so arrowing back up past the first row returns to the raw query.
      setActive((current) => {
        const next = current + step;
        if (next < -1) return ordered.length - 1;
        if (next >= ordered.length) return -1;
        return next;
      });
      return;
    }

    if (event.key === "Enter") {
      if (active >= 0 && ordered[active]) {
        event.preventDefault();
        go(ordered[active]);
      }
      // Otherwise the form submits to /search, which is the deliberate overflow for a broad query.
    }
  }

  const activeId = active >= 0 ? `${listId}-${active}` : undefined;

  return (
    <div ref={rootRef} className="relative w-full max-w-2xl">
      <form action="/search" role="search" className="relative">
        <label htmlFor={`${listId}-input`} className="sr-only">
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
          id={`${listId}-input`}
          ref={inputRef}
          name="q"
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Describe what you’re trying to do"
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          className="peer w-full rounded-2xl border border-line bg-surface py-4 pr-5 pl-13 text-base text-ink transition-colors placeholder:text-ink-faint focus:border-line-strong focus:bg-surface-raised"
        />

        {/* One hairline along the bottom edge while a query is in flight. The only place a bright
            accent reads as activity rather than as an error. */}
        {state.status === "loading" && slow && (
          <span
            aria-hidden
            className="absolute inset-x-5 bottom-0 h-px overflow-hidden rounded-full bg-line"
          >
            <span className="block h-full w-1/3 bg-accent motion-safe:animate-[searching_1.1s_ease-in-out_infinite]" />
          </span>
        )}
      </form>

      {/* Results replace each other asynchronously, so the count is announced rather than left to
          be discovered. Outside the panel, which unmounts between queries. */}
      <p role="status" aria-live="polite" className="sr-only">
        {fresh
          ? `${hits.length} ${hits.length === 1 ? "result" : "results"} for ${state.query}`
          : state.status === "loading"
            ? "Searching…"
            : ""}
      </p>

      {showPanel && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-lg">
          <ul
            id={listId}
            role="listbox"
            aria-label="Search results"
            // `overscroll-contain` so scrolling to the end of the list does not start scrolling
            // the page behind it.
            className="max-h-[26rem] overflow-y-auto overscroll-contain"
          >
            {groups.map((group) => (
              <li key={group.label}>
                <SearchGroupHeading
                  label={group.label}
                  count={group.hits.length}
                />
                <ul role="presentation">
                  {group.hits.map((hit) => {
                    const position = ordered.indexOf(hit);
                    return (
                      <li key={hit.key}>
                        <SearchResultRow
                          hit={hit}
                          id={`${listId}-${position}`}
                          active={position === active}
                          onHover={() => setActive(position)}
                        />
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>

          {fresh && hits.length === 0 && (
            <div className="flex flex-col gap-3 px-4 py-6">
              <p className="text-sm text-ink">
                Nothing matches “{state.query}”.
              </p>
              <p className="text-xs leading-relaxed text-ink-muted">
                Try describing the task instead of naming it — “review a pull
                request” rather than “PR tool”.
              </p>
            </div>
          )}

          {state.status === "failed" && (
            <p className="px-4 py-6 text-sm text-ink-muted">
              Search is unavailable. Browse{" "}
              <Link href="/skills" className="text-accent hover:underline">
                skills
              </Link>{" "}
              or{" "}
              <Link href="/tools" className="text-accent hover:underline">
                CI tools
              </Link>{" "}
              instead.
            </p>
          )}

          {state.status === "loading" && slow && (
            <div className="flex flex-col gap-3 px-4 py-4">
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex flex-col gap-1.5">
                  <span className="h-3 w-1/3 rounded bg-line" />
                  <span className="h-2.5 w-2/3 rounded bg-line/60" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* At rest the examples do the teaching: they are sentences, which is what the field wants,
          and they are buttons rather than decoration. */}
      {!showPanel && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-faint">Try</span>
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setQuery(example);
                setOpen(true);
                inputRef.current?.focus();
              }}
              className="rounded-full border border-line px-3 py-1 text-xs text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              {example}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
