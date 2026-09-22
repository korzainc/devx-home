"use client";

import { useLayoutEffect } from "react";

/** Restore the original shared reveal; content is visible unless this controller arms it. */
export function GettingStartedEntrance() {
  useLayoutEffect(() => {
    const motion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const root = document.querySelector(".getting-started");
    if (!motion || motion.matches || !root) return;

    const sections = [
      ...root.querySelectorAll<HTMLElement>(
        ":scope > section:not(:first-child)",
      ),
    ];
    let shown = false;
    let frame = 0;

    const reveal = (immediate = false) => {
      if (shown && !immediate) return;
      shown = true;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      for (const section of sections) {
        if (immediate) delete section.dataset.entry;
        else section.dataset.entry = "ready";
      }
    };
    const onScroll = () => reveal();
    const onFocus = () => {
      // Keep the entrance finished after focus leaves the command.
      const command = root.querySelector<HTMLElement>(".gs-hero-command");
      if (command) command.dataset.entrance = "done";
      reveal(true);
    };
    const onHash = () => reveal(true);
    const onMotion = () => {
      if (motion.matches) reveal(true);
    };

    for (const section of sections) section.dataset.entry = "waiting";
    root.addEventListener("focusin", onFocus);
    window.addEventListener("hashchange", onHash);
    motion.addEventListener("change", onMotion);
    window.addEventListener("scroll", onScroll, { passive: true, once: true });
    const timer = setTimeout(onScroll, 1500);

    if (window.location.hash || root.contains(document.activeElement)) {
      reveal(true);
    } else if (
      !sections[0] ||
      sections[0].getBoundingClientRect().top < innerHeight
    ) {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(onScroll);
      });
    }

    return () => {
      reveal(true);
      root.removeEventListener("focusin", onFocus);
      window.removeEventListener("hashchange", onHash);
      motion.removeEventListener("change", onMotion);
    };
  }, []);

  return null;
}
