"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { RefObject } from "react";

// WCAG 2.1.4 requires an unmodified single-character shortcut to be turnable off, remappable,
// or focus-scoped; this is the "turn it off" escape. Module-scope, not component state, because
// every catalogue grid on the page shares one localStorage key and must agree on its value. The
// server has no localStorage, so `useSyncExternalStore`'s `getServerSnapshot` renders "on" there
// and on first client paint, then hands off with no mismatch.
const STORAGE_KEY = "korza-devx:slash-shortcut-enabled";
const listeners = new Set<() => void>();
// Set only when a write fails (private browsing, storage disabled), so a read has something to
// return instead of replaying the stale pre-write value from storage. Cleared on a write that
// succeeds, so storage recovering mid-session is trusted again rather than shadowed forever.
let override: boolean | null = null;

function getEnabled(): boolean {
  if (override !== null) return override;
  try {
    return localStorage.getItem(STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

function getServerSnapshot(): boolean {
  return true;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function setEnabled(next: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(next));
    override = null;
  } catch {
    override = next;
  }
  for (const listener of listeners) listener();
}

/** "/" focuses the given input unless the shortcut has been turned off, ignored while typing or
 * an expanded disclosure has focus (a facet popup, an unclassified-rows toggle) so it doesn't
 * steal focus from something already open. */
export function useSlashShortcut(
  searchRef: RefObject<HTMLInputElement | null>,
): { enabled: boolean; toggle: () => void } {
  const enabled = useSyncExternalStore(
    subscribe,
    getEnabled,
    getServerSnapshot,
  );

  useEffect(() => {
    if (!enabled) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.matches(
          'input, textarea, [contenteditable], [aria-expanded="true"]',
        )
      )
        return;
      if (!searchRef.current?.offsetParent) return;
      event.preventDefault();
      searchRef.current.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled, searchRef]);

  return { enabled, toggle: () => setEnabled(!enabled) };
}
