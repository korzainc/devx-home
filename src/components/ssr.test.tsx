/**
 * @vitest-environment node
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PluginSkills } from "@/components/plugin-skills";
import { SkillContextStrip } from "@/components/skill-context-strip";
import { SkillsFirstRunNudge } from "@/components/skills-first-run";
import { skillsForPlugin } from "@/lib/catalogue";

/**
 * The only tests outside jsdom. The store's server snapshot must be a constant: reading the
 * live URL there crashes the prerender, and every other test runs where `window` exists.
 */

const skills = skillsForPlugin("mattpocock-skills");

describe("prerendering", () => {
  it("renders the strip to nothing on the server", () => {
    expect(
      renderToString(
        <SkillContextStrip plugin="mattpocock-skills" skills={skills} />,
      ),
    ).toBe("");
  });

  /**
   * The nudge portals to `document.body`, which react-dom/server cannot do. It gets away with
   * it because the store's server snapshot reports dismissed, so it returns before reaching
   * the portal -- an invariant with nothing else holding it in place. Flip that snapshot and
   * the prerender of every page carrying this component throws.
   */
  it("renders the nudge to nothing, so its portal is never reached", () => {
    expect(renderToString(<SkillsFirstRunNudge />)).toBe("");
  });

  it("renders the list's preview on the server, and marks nothing", () => {
    const html = renderToString(
      <PluginSkills plugin="mattpocock-skills" skills={skills} />,
    );
    expect(html).toContain(skills[0].name);
    expect(html).not.toContain("aria-current");
  });
});
