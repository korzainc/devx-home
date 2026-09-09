/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SkillContextStrip } from "@/components/skill-context-strip";
import { skillsForPlugin } from "@/lib/catalogue";
import type { SkillEntry } from "@/lib/catalogue-entries";

/** Every failure here is silent: nothing renders, or the wrong skill is named. */

afterEach(() => {
  cleanup();
  history.replaceState(null, "", "/");
});

const openedFor = (name: string) =>
  history.replaceState(null, "", name ? `?skill=${name}` : "/");

const skills = skillsForPlugin("mattpocock-skills");

// By name, never by position: an exclusion or an upstream addition shifts every later index,
// which is how this file broke when `code-review` and `tdd` left the catalogue.
function named(name: string) {
  const skill = skills.find((candidate) => candidate.name === name);
  if (!skill) throw new Error(`mattpocock-skills no longer ships ${name}`);
  return skill;
}

// Three rows, so the position line has literals the component cannot derive from the fixture.
const fixture = [
  { name: "first", summary: "The one before." },
  { name: "middle", summary: "The one under test." },
  { name: "last", summary: "The one after." },
] as unknown as SkillEntry[];

describe("the skill context strip", () => {
  it("counts the position and the total from the list it was given", () => {
    openedFor("middle");
    render(<SkillContextStrip plugin="p" skills={fixture} />);

    expect(screen.getByText("2 of 3 in this plugin")).toBeTruthy();
  });

  it("names the skill the page was opened for, and where it sits in the plugin", () => {
    const target = named("wizard");
    openedFor(target.name);

    render(<SkillContextStrip plugin="mattpocock-skills" skills={skills} />);

    expect(screen.getByText(target.name)).toBeTruthy();
    expect(screen.getByText(target.summary!)).toBeTruthy();
    expect(screen.getByText(/^\d+ of \d+ in this plugin$/)).toBeTruthy();
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
    const target = named("wizard");
    openedFor(target.name);
    render(<SkillContextStrip plugin="mattpocock-skills" skills={skills} />);

    expect(screen.getByText(target.summary!).className).toContain(
      "line-clamp-2",
    );
  });

  it("clamps the skill name too, and keeps the full value for the lookup", () => {
    // The name comes from the URL, so it is as unbounded as the summary was.
    const target = named("wizard");
    openedFor(target.name);
    render(<SkillContextStrip plugin="mattpocock-skills" skills={skills} />);

    expect(screen.getByText(target.name).className).toContain("line-clamp-2");
    // Clamping the render must not have narrowed the lookup: the position still resolves.
    expect(screen.getByText(/^\d+ of \d+ in this plugin$/)).toBeTruthy();
  });

  it("keeps the arrow out of the control's accessible name", () => {
    openedFor(named("wizard").name);
    render(<SkillContextStrip plugin="mattpocock-skills" skills={skills} />);

    expect(screen.getByRole("button", { name: "Show in list" })).toBeTruthy();
  });

  it("uses no token that fails AA on its own background", () => {
    // contrast.test.ts proves --accent-strong and --ink-muted clear 4.5 on --accent-wash.
    // This is the other half: that the strip actually reaches for those and not the two that
    // measure 4.38 and 4.41 there.
    openedFor(named("wizard").name);
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

  it("says nothing about a fragment that is not a skill", () => {
    // The fallback carries old links, but any other anchor on the page must not be read as a
    // stale skill link.
    history.replaceState(null, "", "/skills/mattpocock-skills#install");
    const { container } = render(
      <SkillContextStrip plugin="mattpocock-skills" skills={skills} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("still explains a stale ?skill= link", () => {
    openedFor("renamed-upstream");
    render(<SkillContextStrip plugin="mattpocock-skills" skills={skills} />);
    expect(screen.getByText(/not in the plugin/i)).toBeTruthy();
  });

  it("survives a skill value that is not valid encoding", () => {
    // A hand-rolled decode of "%" throws during render and takes the page down.
    openedFor("%");
    expect(() =>
      render(<SkillContextStrip plugin="mattpocock-skills" skills={skills} />),
    ).not.toThrow();
  });
});
