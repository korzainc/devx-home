"use client";

import { useEffect, useRef, useState } from "react";

/** One facet as a dropdown. The count sits on the button so a closed menu still says it is on. */
export function FacetMenu({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: [string, number][];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Close on outside click and on Escape: a menu that only closes by re-clicking its own button
  // strands the pointer once a second menu is open.
  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const on = selected.length > 0;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((was) => !was)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
          on
            ? "border-line-strong bg-accent-wash text-ink"
            : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
        }`}
      >
        {label}
        {on && (
          <span className="font-mono text-xs text-accent">
            {selected.length}
          </span>
        )}
        <span aria-hidden className="text-[0.6rem] text-ink-faint">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="absolute top-full right-0 z-20 mt-1.5 max-h-80 w-56 overflow-y-auto rounded-lg border border-line-strong bg-surface-raised p-1 shadow-lg">
          {options.map(([value, count]) => {
            const checked = selected.includes(value);
            return (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-ink-muted hover:bg-surface hover:text-ink"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(value)}
                  className="size-3.5 accent-accent"
                />
                <span className="truncate">{value}</span>
                <span className="ml-auto shrink-0 font-mono text-[0.65rem] text-ink-faint">
                  {count}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
