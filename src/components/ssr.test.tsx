/**
 * @vitest-environment node
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PluginSkills } from "@/components/plugin-skills";
import { SkillContextStrip } from "@/components/skill-context-strip";
import { skillsForPlugin } from "@/lib/catalogue";

/**
 * The only tests that run outside jsdom. Both components read the URL through a store whose
 * server snapshot is deliberately empty, and every other test in the suite runs where `window`
 * exists — so the whole prerender path, and the reason that snapshot is a constant, had no
 * coverage at all. Reading the live URL there instead crashes the build, silently as far as the
 * rest of the suite is concerned.
 */

const skills = skillsForPlugin("mattpocock-skills");

describe("prerendering", () => {
  it("renders the strip to nothing on the server", () => {
    expect(renderToString(<SkillContextStrip skills={skills} />)).toBe("");
  });

  it("renders the list's preview on the server, and marks nothing", () => {
    const html = renderToString(<PluginSkills skills={skills} />);
    expect(html).toContain(skills[0].name);
    expect(html).not.toContain("aria-current");
  });
});
