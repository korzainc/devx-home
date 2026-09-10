import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import SkillsDemoPage from "@/app/skills-intro/demo/page";
import SkillsIntroPage from "@/app/skills-intro/page";

// Drop the recorder and nothing else fails. Tree walked, not rendered: server components.
function contains(element: ReactElement, name: string): boolean {
  if (typeof element.type === "function" && element.type.name === name) {
    return true;
  }
  const props = element.props as { children?: unknown };
  const children = Array.isArray(props.children)
    ? props.children
    : [props.children];
  return children.some(
    (child) =>
      Boolean(child) &&
      typeof child === "object" &&
      "type" in (child as object) &&
      contains(child as ReactElement, name),
  );
}

describe("the intro pages", () => {
  it("records the intro on arrival", () => {
    expect(contains(SkillsIntroPage(), "SkillsIntroSeen")).toBe(true);
  });

  it("records it on the demo too", () => {
    expect(contains(SkillsDemoPage(), "SkillsIntroSeen")).toBe(true);
  });
});
