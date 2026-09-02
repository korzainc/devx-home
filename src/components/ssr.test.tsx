/**
 * @vitest-environment node
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PluginSkills } from "@/components/plugin-skills";
import { SkillContextStrip } from "@/components/skill-context-strip";
import { skillsForPlugin } from "@/lib/catalogue";

/**
 * The only tests outside jsdom. The store's server snapshot must be a constant: reading the
 * live URL there crashes the prerender, and every other test runs where `window` exists.
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
