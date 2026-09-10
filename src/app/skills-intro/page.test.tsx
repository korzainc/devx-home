import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import SkillsDemoPage from "@/app/skills-intro/demo/page";
import SkillsIntroPage from "@/app/skills-intro/page";

/**
 * Both intro pages are where the first-run flag is written, and the nudge on `/skills` stays
 * up until one of them arrives. Drop the recorder from a page and nothing else fails: the
 * component keeps its own tests, the nudge keeps its own, and the reader is greeted forever.
 *
 * The tree is walked rather than rendered, following `tools/page.test.tsx`: these are server
 * components, and React 19 will not mount an async one on the client.
 */
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
