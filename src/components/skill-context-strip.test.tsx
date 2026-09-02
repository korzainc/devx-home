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
  history.replaceState(null, "", "/");
});

const openedFor = (name: string) =>
  history.replaceState(null, "", name ? `?skill=${name}` : "/");

const skills = skillsForPlugin("mattpocock-skills");

describe("the skill context strip", () => {
  it("names the skill the page was opened for, and where it sits in the plugin", () => {
    const target = skills[17];
    expect(target.name).toBe("wizard");
    openedFor(target.name);

    render(<SkillContextStrip skills={skills} />);

    expect(screen.getByText(target.name)).toBeTruthy();
    expect(screen.getByText(target.summary!)).toBeTruthy();
    // Position, not just the name: it is what tells you the list below is 25 long and in its
    // own order, so the card is somewhere other than the top.
    expect(screen.getByText("18 of 25 in this plugin")).toBeTruthy();
    // The landmark's accessible name: an <aside> keeps role="complementary" without it, so
    // dropping the label left a nameless landmark that queryByRole still found.
    expect(
      screen.getByRole("complementary", { name: /opened for/i }),
    ).toBeTruthy();
  });

  it("renders nothing when the page was opened without a skill", () => {
    // Asserted on the container, not on the text. The previous version looked for
    // /in this plugin$/, which the stale-link sentence does not end with, so it passed while
    // the strip rendered "Opened for /" and a stale-link message on every direct visit — and
    // it would have passed with this component deleted.
    const { container } = render(<SkillContextStrip skills={skills} />);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("says a link has gone stale rather than rendering nothing", () => {
    // Skill names come from the generated index, so an upstream rename changes the link.
    // Rendering nothing is indistinguishable from arriving with no link at all.
    openedFor("renamed-upstream");
    render(<SkillContextStrip skills={skills} />);

    expect(screen.getByText(/renamed-upstream/)).toBeTruthy();
    expect(screen.getByText(/not in the plugin/i)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("survives a skill value that is not valid encoding", () => {
    // A hand-rolled decode of "%" throws, and thrown during render it takes the page down.
    openedFor("%");
    expect(() => render(<SkillContextStrip skills={skills} />)).not.toThrow();
  });
});
