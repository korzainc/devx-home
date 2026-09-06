"use client";

import { useEffect, useState } from "react";

/** Settles on `value` `delayMs` after it stops changing. Used for the aria-live count/status
 * announcement, so a screen reader isn't read a new number on every keystroke while a search
 * term is still being typed. */
export function useDebouncedValue<T>(value: T, delayMs = 500): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);
  return settled;
}
