/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { readOpenedSkill, skillLink } from "@/lib/skill-link";

afterEach(() => history.replaceState(null, "", "/"));

describe("a link to one skill", () => {
  it("survives a name only upstream gets to choose", () => {
    // Every name in the index is slug-safe today, but the index is generated from third-party
    // repositories. An unencoded "&" ends the parameter early and the reader gets half a name.
    const name = "review & fix";
    history.replaceState(null, "", skillLink("some-plugin", name));

    expect(readOpenedSkill()).toBe(name);
  });

  it("names the plugin page, not the skill", () => {
    // generateStaticParams only emits plugin ids, so a skill in the path 404s.
    expect(skillLink("mattpocock-skills", "wizard")).toBe(
      "/skills/mattpocock-skills?skill=wizard",
    );
  });
});
