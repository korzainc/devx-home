"use client";

import { useEffect } from "react";
import { markIntroSeen } from "@/lib/skills-intro-seen";

/** Records the intro as reached, on arrival. Renders nothing. */
export function SkillsIntroSeen() {
  useEffect(() => {
    markIntroSeen();
  }, []);

  return null;
}
