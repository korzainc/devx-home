/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { readOpenedSkill, skillLink } from "@/lib/skill-link";

afterEach(() => history.replaceState(null, "", "/"));

describe("a link to one skill", () => {
  it("survives a name only upstream gets to choose", () => {
    // The index is generated from third-party repos; an unencoded "&" truncates the name.
    const name = "review & fix";
    history.replaceState(null, "", skillLink("some-plugin", name));

    expect(readOpenedSkill()).toBe(name);
  });

  it("names the plugin page, not the skill", () => {
    expect(skillLink("mattpocock-skills", "wizard")).toBe(
      "/skills/mattpocock-skills?skill=wizard",
    );
  });
});
