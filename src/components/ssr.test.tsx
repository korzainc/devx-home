/**
 * @vitest-environment node
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PluginSkills } from "@/components/plugin-skills";
import { SkillContextStrip } from "@/components/skill-context-strip";
import { SkillsFirstRunNudge } from "@/components/skills-first-run";
import { skillsForPlugin } from "@/lib/catalogue";
import { INTRO_ROUTE } from "@/lib/skills-intro-seen";

vi.mock("next/navigation", () => ({ usePathname: () => INTRO_ROUTE }));

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
   * The first-run nudge has to be in the HTML the server sends. Rendered only after
   * hydration, it lands on top of a catalogue the reader has already been looking at.
   */
  it("renders the nudge, so it is there in the first paint", () => {
    expect(renderToString(<SkillsFirstRunNudge />)).toContain('role="dialog"');
  });

  it("renders the list's preview on the server, and marks nothing", () => {
    const html = renderToString(
      <PluginSkills plugin="mattpocock-skills" skills={skills} />,
    );
    expect(html).toContain(skills[0].name);
    expect(html).not.toContain("aria-current");
  });
});
