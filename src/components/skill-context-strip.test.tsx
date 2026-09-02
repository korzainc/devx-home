/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SkillContextStrip } from "@/components/skill-context-strip";
import { skillsForPlugin } from "@/lib/catalogue";

/**
 * The strip is the only thing on the page that says which skill you clicked to get here. Every
 * failure below is silent: it renders nothing, or it names the wrong skill, and the page still
 * looks finished.
 */

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

const skills = skillsForPlugin("mattpocock-skills");

describe("the skill context strip", () => {
  it("names the skill the page was opened for, and where it sits in the plugin", () => {
    const target = skills[17];
    expect(target.name).toBe("wizard");
    window.location.hash = `#${target.name}`;

    render(<SkillContextStrip skills={skills} />);

    expect(screen.getByText(target.name)).toBeTruthy();
    expect(screen.getByText(target.summary!)).toBeTruthy();
    // Position, not just the name: it is what tells you the list below is 25 long and in its
    // own order, so the card is somewhere other than the top.
    expect(screen.getByText("18 of 25 in this plugin")).toBeTruthy();
  });

  it("renders nothing when the page was opened without a skill", () => {
    render(<SkillContextStrip skills={skills} />);
    expect(screen.queryByText(/in this plugin$/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says a link has gone stale rather than rendering nothing", () => {
    // Skill names come from the generated index, so an upstream rename changes the fragment.
    // Rendering nothing is indistinguishable from arriving with no hash at all.
    window.location.hash = "#renamed-upstream";
    render(<SkillContextStrip skills={skills} />);

    expect(screen.getByText(/renamed-upstream/)).toBeTruthy();
    expect(screen.getByText(/no longer in this plugin/i)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("survives a hash that is not valid encoding", () => {
    // "#%" throws inside decodeURIComponent. Thrown during render it takes the page down.
    window.location.hash = "#%";
    expect(() => render(<SkillContextStrip skills={skills} />)).not.toThrow();
  });
});
