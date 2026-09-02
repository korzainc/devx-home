/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PluginSkills } from "@/components/plugin-skills";
import { SkillContextStrip } from "@/components/skill-context-strip";
import { skillsForPlugin } from "@/lib/catalogue";
import { SKILL_LIST_ID } from "@/lib/skill-link";

/**
 * The strip sits above the install fold and the list sits below it, with a server component in
 * between, so they cannot share React state. These tests are the contract between them.
 */

beforeEach(() => {
  // jsdom has no layout engine, so it implements neither of these.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  history.replaceState(null, "", "/");
});

const openedFor = (name: string) =>
  history.replaceState(null, "", name ? `?skill=${name}` : "/");

const skills = skillsForPlugin("mattpocock-skills");

function Page() {
  return (
    <>
      <SkillContextStrip skills={skills} />
      <PluginSkills skills={skills} />
    </>
  );
}

// Scoped to the list: the strip names the target skill too, so an unscoped count reads one
// card more than the grid is actually showing.
const list = () => within(document.getElementById(SKILL_LIST_ID)!);
const shownCount = () =>
  skills.filter((skill) => list().queryByText(skill.name)).length;

describe("arriving from a skill card", () => {
  it("lands with the list collapsed and in its own order, even for a skill past the preview", () => {
    // The whole point of treatment A: the strip carries the answer, so the list does not have
    // to reorder or unfold itself to deliver it.
    const target = skills[17];
    openedFor(target.name);
    render(<Page />);

    expect(shownCount()).toBe(5);
    expect(
      screen.getByRole("button", {
        name: new RegExp(`^Show all ${skills.length} skills`),
      }),
    ).toBeTruthy();
    expect(
      screen.getByText(`18 of ${skills.length} in this plugin`),
    ).toBeTruthy();
    // First five are the plugin's own order, not the target hoisted to the top.
    expect(list().queryByText(skills[0].name)).toBeTruthy();
    expect(list().queryByText(target.name)).toBeNull();
  });

  it("does not scroll on arrival", () => {
    // Auto-scrolling puts the install commands behind the reader, which is the cost treatment
    // B pays and A does not.
    openedFor(skills[17].name);
    render(<Page />);
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("reveals the skill and moves focus onto its card when Show in list is used", () => {
    const target = skills[17];
    openedFor(target.name);
    render(<Page />);

    fireEvent.click(screen.getByRole("button", { name: /show in list/i }));

    expect(shownCount()).toBe(skills.length);
    const card = document.getElementById(target.name);
    // Focus, not just scroll: a keyboard user who activates the control is otherwise left on
    // a button at the top of the page while the view moves without them.
    expect(document.activeElement).toBe(card);
    expect(card?.getAttribute("tabindex")).toBe("-1");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("moves focus without expanding when the skill is already in the preview", () => {
    const target = skills[1];
    openedFor(target.name);
    render(<Page />);

    fireEvent.click(screen.getByRole("button", { name: /show in list/i }));

    expect(shownCount()).toBe(5);
    expect(document.activeElement).toBe(document.getElementById(target.name));
  });

  it("collapses again after a jump", () => {
    // The jump forces the grid open from outside its own toggle, so the toggle has to be able
    // to undo it, or the grid is stuck open for the rest of the visit.
    openedFor(skills[17].name);
    render(<Page />);

    fireEvent.click(screen.getByRole("button", { name: /show in list/i }));
    expect(shownCount()).toBe(skills.length);

    fireEvent.click(screen.getByRole("button", { name: /^Show fewer/ }));
    expect(shownCount()).toBe(5);
  });

  it("moves focus back to the card when the control is used a second time", () => {
    // Reading further down and then reaching for the strip again is the obvious second use.
    // Keyed only on the skill name, the second press is a no-op because the name never changed.
    const target = skills[17];
    openedFor(target.name);
    render(<Page />);
    const control = screen.getByRole("button", { name: /show in list/i });

    fireEvent.click(control);
    expect(document.activeElement).toBe(document.getElementById(target.name));

    (document.activeElement as HTMLElement).blur();
    control.focus();
    fireEvent.click(control);

    expect(document.activeElement).toBe(document.getElementById(target.name));
  });

  it("still names the skill after the list collapses again", () => {
    // The strip reads the URL, so anything on this page that rewrites it blanks the strip
    // mid-visit. The list used to clear the URL on collapse for its own reasons; this is what
    // fails if that comes back.
    const target = skills[17];
    openedFor(target.name);
    render(<Page />);

    fireEvent.click(screen.getByRole("button", { name: /show in list/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Show fewer/ }));

    expect(screen.getByText("Opened for")).toBeTruthy();
    expect(
      screen.getByText(`18 of ${skills.length} in this plugin`),
    ).toBeTruthy();
  });

  it("points the strip's control at the list it expands", () => {
    openedFor(skills[17].name);
    render(<Page />);

    const control = screen.getByRole("button", { name: /show in list/i });
    const listId = control.getAttribute("aria-controls");
    expect(listId).toBeTruthy();
    expect(document.getElementById(listId!)).toBeTruthy();
  });
});
