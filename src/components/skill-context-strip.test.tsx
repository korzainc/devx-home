/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SkillContextStrip } from "@/components/skill-context-strip";
import { skillsForPlugin } from "@/lib/catalogue";

/** Every failure here is silent: nothing renders, or the wrong skill is named. */

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

    render(<SkillContextStrip plugin="mattpocock-skills" skills={skills} />);

    expect(screen.getByText(target.name)).toBeTruthy();
    expect(screen.getByText(target.summary!)).toBeTruthy();
    expect(screen.getByText("18 of 25 in this plugin")).toBeTruthy();
    // The landmark's name: an <aside> keeps its role without one, so queryByRole still found it.
    expect(
      screen.getByRole("complementary", { name: /opened for/i }),
    ).toBeTruthy();
  });

  it("renders nothing when the page was opened without a skill", () => {
    // On the container, not the text: a text assertion here passed with the component deleted.
    const { container } = render(
      <SkillContextStrip plugin="mattpocock-skills" skills={skills} />,
    );
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("says a link has gone stale rather than rendering nothing", () => {
    // Rendering nothing is indistinguishable from arriving with no link.
    openedFor("renamed-upstream");
    render(<SkillContextStrip plugin="mattpocock-skills" skills={skills} />);

    expect(screen.getByText(/renamed-upstream/)).toBeTruthy();
    expect(screen.getByText(/not in the plugin/i)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("still explains a stale link on a plugin that ships nothing", () => {
    // pyright-lsp resolves to zero skills, and is where a stale link most needs explaining.
    openedFor("anything");
    render(<SkillContextStrip plugin="pyright-lsp" skills={[]} />);

    expect(screen.getByText(/not in the plugin/i)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("clamps the summary so the install panel stays on the first screen", () => {
    // The fallback is upstream SKILL.md prose, ~890 chars at its longest, and unclamped it
    // filled a 390px viewport.
    const target = skills[17];
    openedFor(target.name);
    render(<SkillContextStrip plugin="mattpocock-skills" skills={skills} />);

    expect(screen.getByText(target.summary!).className).toContain(
      "line-clamp-2",
    );
  });

  it("clamps the skill name too, and keeps the full value for the lookup", () => {
    // The name comes from the URL, so it is as unbounded as the summary was.
    const target = skills[17];
    openedFor(target.name);
    render(<SkillContextStrip plugin="mattpocock-skills" skills={skills} />);

    expect(screen.getByText(target.name).className).toContain("line-clamp-2");
    // Clamping the render must not have narrowed the lookup: the position still resolves.
    expect(
      screen.getByText(`18 of ${skills.length} in this plugin`),
    ).toBeTruthy();
  });

  it("keeps the arrow out of the control's accessible name", () => {
    openedFor(skills[17].name);
    render(<SkillContextStrip plugin="mattpocock-skills" skills={skills} />);

    expect(screen.getByRole("button", { name: "Show in list" })).toBeTruthy();
  });

  it("uses no token that fails AA on its own background", () => {
    // contrast.test.ts proves --accent-strong and --ink-muted clear 4.5 on --accent-wash.
    // This is the other half: that the strip actually reaches for those and not the two that
    // measure 4.38 and 2.76 there.
    openedFor(skills[17].name);
    const { container } = render(
      <SkillContextStrip plugin="mattpocock-skills" skills={skills} />,
    );

    const classes = [...container.querySelectorAll("*")]
      .map((node) => node.className)
      .join(" ");
    // Negative lookahead, or these also match text-accent-strong.
    expect(classes).not.toMatch(/\btext-ink-faint(?![-\w])/);
    expect(classes).not.toMatch(/\btext-accent(?![-\w])/);
  });

  it("survives a skill value that is not valid encoding", () => {
    // A hand-rolled decode of "%" throws during render and takes the page down.
    openedFor("%");
    expect(() =>
      render(<SkillContextStrip plugin="mattpocock-skills" skills={skills} />),
    ).not.toThrow();
  });
});
