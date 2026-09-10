"use client";

import { useEffect } from "react";
import { markIntroSeen } from "@/lib/skills-intro-seen";

/**
 * Records that the reader reached the introduction. Renders nothing.
 *
 * The nudge used to write the flag in the link's `onClick`, which unmounted the overlay while
 * the destination was still loading and left the bare catalogue on screen for that moment.
 * Writing it here instead means the overlay stays up until `/skills` unmounts, and the flag
 * means the intro was reached rather than merely clicked toward.
 */
export function SkillsIntroSeen() {
  useEffect(() => {
    markIntroSeen();
  }, []);

  return null;
}
