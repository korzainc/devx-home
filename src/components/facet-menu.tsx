"use client";

import { useEffect, useRef, useState } from "react";

/** Gap kept clear of the viewport edge. */
const EDGE = 8;

/** The count sits on the button so a closed menu still says it is on. */
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
  // Offset from the trigger, clamped into the viewport. A left/right flip cannot express the
  // narrow case where neither anchor fits.
  const [offset, setOffset] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  // A menu that only closes by re-clicking its own button strands the pointer once a second
  // one is open.
  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Only reclaim focus if it was inside the menu; the listener is on document, so
      // otherwise Escape drags focus here from wherever the user actually was.
      if (root.current?.contains(document.activeElement))
        trigger.current?.focus();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function place() {
      const box = root.current?.getBoundingClientRect();
      const width = popup.current?.offsetWidth;
      if (!box || !width) return;
      const room = window.innerWidth - EDGE - width;
      setOffset(Math.max(EDGE, Math.min(box.right - width, room)) - box.left);
    }
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  const on = selected.length > 0;

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors ${
          on
            ? "border-line-strong bg-accent-wash text-ink"
            : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
        }`}
      >
        {label}
        {on && (
          <span className="font-mono text-xs text-ink">{selected.length}</span>
        )}
        <span aria-hidden className="text-[0.6rem] text-ink-faint">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div
          ref={popup}
          style={offset === null ? undefined : { left: offset }}
          role="group"
          aria-label={label}
          className={`absolute top-full z-20 mt-1.5 max-h-80 w-56 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-line-strong bg-surface-raised p-1 shadow-lg ${offset === null ? "right-0" : ""}`}
        >
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
