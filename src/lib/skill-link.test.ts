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

  it("still reads a link that predates the query string", () => {
    // Links handed out from the current deploy use a fragment. Card ids are plugin-qualified
    // now, so a fragment does not even find a native anchor target to fall back on.
    history.replaceState(null, "", "/skills/mattpocock-skills#wizard");
    expect(readOpenedSkill()).toBe("wizard");
  });

  it("survives a fragment that is not valid encoding", () => {
    history.replaceState(null, "", "/skills/mattpocock-skills#%");
    expect(() => readOpenedSkill()).not.toThrow();
  });

  it("prefers the query string when a link carries both", () => {
    history.replaceState(null, "", "/skills/p?skill=fromquery#fromhash");
    expect(readOpenedSkill()).toBe("fromquery");
  });

  it("names the plugin page, not the skill", () => {
    expect(skillLink("mattpocock-skills", "wizard")).toBe(
      "/skills/mattpocock-skills?skill=wizard",
    );
  });
});
