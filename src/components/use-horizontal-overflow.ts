"use client";

import { useEffect, useRef, useState } from "react";

/** Keep keyboard access tied to actual overflow, including resized disclosures. */
export function useHorizontalOverflow(content: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () =>
      setOverflowing(element.scrollWidth > element.clientWidth + 1);
    update();
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(element);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [content]);
  return { ref, tabIndex: overflowing ? 0 : -1 };
}
