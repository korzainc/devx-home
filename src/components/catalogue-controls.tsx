"use client";

import { useId, useRef, type ReactNode } from "react";
import { useSlashShortcut } from "@/lib/slash-shortcut";
import { useDebouncedValue } from "@/lib/use-debounced-value";

/** The search field every catalogue page carries, including the `/` shortcut and its opt-out.
 *  Owns its own ref: the shortcut hook needs one, and no caller has a reason to steal focus now
 *  that removable filter chips are gone. */
export function CatalogueSearch({
  label,
  value,
  onChange,
}: {
  /** Doubles as the placeholder and the field's only label, which is visually hidden. */
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  // Both catalogue panels stay mounted at once under test, so a fixed id would give the
  // document two search inputs.
  const searchId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const { enabled, toggle } = useSlashShortcut(searchRef);

  return (
    <div className="relative flex-1">
      <label htmlFor={searchId} className="sr-only">
        {label}
      </label>
      <span
        aria-hidden
        className="absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-faint"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path
            d="m20 20-3.5-3.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <input
        id={searchId}
        ref={searchRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          // Clears first; blurring outright would dump focus onto <body>, restarting the next
          // Tab from the top of the document instead of continuing past this field. An
          // already-empty field has nothing left to clear, so Escape falls back to the plain
          // dismiss a user expects instead of doing nothing at all.
          if (value) onChange("");
          else event.currentTarget.blur();
        }}
        placeholder={label}
        className="w-full rounded-lg border border-line bg-surface py-2.5 pr-11 pl-10 text-sm text-ink placeholder:text-ink-faint"
      />
      <button
        type="button"
        onClick={toggle}
        aria-pressed={enabled}
        aria-label={
          enabled
            ? "Keyboard shortcut: press / to jump here. Click to turn it off."
            : "The / keyboard shortcut is off. Click to turn it back on."
        }
        title={
          enabled
            ? "Press / to jump here. Click to turn off."
            : "The / shortcut is off. Click to turn back on."
        }
        className={`absolute top-1/2 right-3 -translate-y-1/2 rounded border border-line px-1.5 py-0.5 font-mono text-[0.65rem] text-ink-faint transition-colors hover:border-line-strong ${enabled ? "" : "line-through"}`}
      >
        /
      </button>
    </div>
  );
}

/** Deliberately has no visible counterpart: a sighted reader takes the result count off the rows
 *  themselves, but a screen reader user has no other way to tell how much the filters just
 *  removed. */
export function ResultCount({
  shown,
  total,
  noun,
}: {
  shown: number;
  total: number;
  noun: string;
}) {
  // The rows update every keystroke; the announcement waits for typing to settle, so a screen
  // reader is not read a new number on every letter.
  const announced = useDebouncedValue(
    // Plural agrees with `total`, the noun it actually sits beside: keying it off the filtered
    // count read "1 of 51 skill shown".
    `${shown} of ${total} ${noun}${total === 1 ? "" : "s"} shown.`,
  );
  return (
    <span role="status" className="sr-only">
      {announced}
    </span>
  );
}

/** A filter axis kept in the open, as toggles rather than behind a menu. Reserved for the axis a
 *  reader is most likely to want, since it costs a permanent row: on `/tools` that is the
 *  language a repo is written in. */
export function ChipRow({
  label,
  options,
  picked,
  onToggle,
  labelFor = (value) => value,
  setApart,
}: {
  label: string;
  options: string[];
  picked: string[];
  onToggle: (value: string) => void;
  labelFor?: (value: string) => string;
  /** Marked with a dashed border. For a value that toggles like the others but does not name the
   *  same kind of thing, so a reader scanning a row of languages sees the odd one out. */
  setApart?: (value: string) => boolean;
}): ReactNode {
  const labelId = useId();
  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span
        id={labelId}
        className="text-xs font-medium tracking-wide text-ink-faint uppercase"
      >
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={labelId}
        className="flex flex-wrap items-center gap-2"
      >
        {options.map((value) => {
          const on = picked.includes(value);
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(value)}
              className={`${setApart?.(value) ? "ml-1 border-dashed" : ""} ${
                on
                  ? "rounded-full border border-line-strong bg-accent-wash px-3 py-1.5 text-sm text-ink transition-colors"
                  : "rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
              }`}
            >
              {labelFor(value)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
