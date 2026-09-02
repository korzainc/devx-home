/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PREVIEW } from "@/components/collapsible-grid";
import { PluginSkills } from "@/components/plugin-skills";
import { SkillContextStrip } from "@/components/skill-context-strip";
import { skillsForPlugin } from "@/lib/catalogue";
import { SKILL_LIST_ID } from "@/lib/skill-link";

/**
 * The contract between the strip and the list, which cannot share state.
 * Not here, because jsdom cannot hide a tree: the `<Activity>` reset. Proven by CDP.
 */

beforeEach(() => {
  // jsdom implements neither.
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("scrollTo", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

const openedFor = (name: string) =>
  history.replaceState(null, "", name ? `?skill=${name}` : "/");

const skills = skillsForPlugin("mattpocock-skills");

// Relative to PREVIEW, never hardcoded: fixed indices straddled the boundary without landing
// on it, which hid a jump that does nothing for exactly one skill.
const inside = skills[1];
const boundary = skills[PREVIEW];
const past = skills[PREVIEW + 12];
const position = (skill: (typeof skills)[number]) =>
  `${skills.indexOf(skill) + 1} of ${skills.length} in this plugin`;

function Page() {
  return (
    <>
      <SkillContextStrip skills={skills} />
      <PluginSkills skills={skills} />
    </>
  );
}

let rerenderPage = () => {};
function renderPage() {
  const { rerender } = render(<Page />);
  rerenderPage = () => rerender(<Page />);
}

// Scoped: the strip names the skill too, so an unscoped count reads one card too many.
const list = () => within(document.getElementById(SKILL_LIST_ID)!);
const shownCount = () =>
  skills.filter((skill) => list().queryByText(skill.name)).length;
const jump = () =>
  fireEvent.click(screen.getByRole("button", { name: /show in list/i }));

describe("arriving from a skill card", () => {
  it("lands with the list collapsed and in its own order, even for a skill past the preview", () => {
    openedFor(past.name);
    renderPage();

    expect(shownCount()).toBe(PREVIEW);
    expect(
      screen.getByRole("button", {
        name: new RegExp(`^Show all ${skills.length} skills`),
      }),
    ).toBeTruthy();
    expect(screen.getByText(position(past))).toBeTruthy();
    // The plugin's own order, not the target hoisted to the top.
    expect(list().queryByText(skills[0].name)).toBeTruthy();
    expect(list().queryByText(past.name)).toBeNull();
  });

  it("moves neither the viewport nor the scroll position on arrival", () => {
    // Nothing may move the window on arrival: auto-scroll hides the install commands, and a
    // scroll reset here stomped what the browser restores on reload.
    openedFor(past.name);
    renderPage();

    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("reveals the skill and moves focus onto its card when Show in list is used", () => {
    openedFor(past.name);
    renderPage();
    jump();

    expect(shownCount()).toBe(skills.length);
    const card = document.getElementById(past.name);
    // Focus too, or a keyboard user is left behind while the view moves.
    expect(document.activeElement).toBe(card);
    expect(card?.getAttribute("tabindex")).toBe("-1");
    // Centred, not "start": the sticky header would sit over the card.
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: "center",
    });
  });

  it("reveals the first skill hidden behind the preview", () => {
    // Off-by-one here leaves the grid collapsed for this one skill; the control does nothing.
    openedFor(boundary.name);
    renderPage();
    expect(list().queryByText(boundary.name)).toBeNull();

    jump();

    expect(document.activeElement).toBe(document.getElementById(boundary.name));
  });

  it("moves focus without expanding when the skill is already in the preview", () => {
    openedFor(inside.name);
    renderPage();
    jump();

    expect(shownCount()).toBe(PREVIEW);
    expect(document.activeElement).toBe(document.getElementById(inside.name));
  });

  it("collapses again after a jump", () => {
    // The jump opens the grid from outside its toggle; the toggle must still close it.
    openedFor(past.name);
    renderPage();
    jump();
    expect(shownCount()).toBe(skills.length);

    fireEvent.click(screen.getByRole("button", { name: /^Show fewer/ }));
    expect(shownCount()).toBe(PREVIEW);
  });

  it("moves focus back to the card when the control is used a second time", () => {
    // Keyed on the name alone, a second press is a no-op.
    openedFor(past.name);
    renderPage();
    jump();
    expect(document.activeElement).toBe(document.getElementById(past.name));

    (document.activeElement as HTMLElement).blur();
    jump();

    expect(document.activeElement).toBe(document.getElementById(past.name));
  });

  it("still names the skill after the list collapses again", () => {
    // The list used to clear the URL on collapse, which blanked the strip.
    openedFor(past.name);
    renderPage();
    jump();
    fireEvent.click(screen.getByRole("button", { name: /^Show fewer/ }));

    expect(screen.getByText("Opened for")).toBeTruthy();
    expect(screen.getByText(position(past))).toBeTruthy();
  });
});

describe("the mark on the opened card", () => {
  it("marks the card the page was opened for, and only that one", () => {
    // A mark on every card identifies nothing. Both halves: the ARIA state and the border.
    openedFor(inside.name);
    renderPage();

    expect(
      [...document.querySelectorAll("[aria-current]")].map((node) => node.id),
    ).toEqual([inside.name]);
    expect(
      [...document.querySelectorAll(`#${SKILL_LIST_ID} .border-accent`)].map(
        (node) => node.id,
      ),
    ).toEqual([inside.name]);
  });

  it("moves the mark and drops the jump when another skill in the plugin is opened", () => {
    openedFor(past.name);
    renderPage();
    jump();
    expect(shownCount()).toBe(skills.length);

    history.pushState(null, "", `?skill=${inside.name}`);
    rerenderPage();

    expect(shownCount()).toBe(PREVIEW);
    expect(
      document.getElementById(inside.name)?.getAttribute("aria-current"),
    ).toBe("true");
    expect(document.getElementById(past.name)).toBeNull();
  });

  it("updates on back and forward, with no re-render to lean on", () => {
    // The subscription's only job; everything else here re-renders for other reasons.
    openedFor(past.name);
    renderPage();
    expect(screen.getByText(position(past))).toBeTruthy();

    history.pushState(null, "", `?skill=${inside.name}`);
    // Raw dispatch: the store must notify with nothing else prompting a render.
    act(() => void window.dispatchEvent(new PopStateEvent("popstate")));

    expect(screen.getByText(position(inside))).toBeTruthy();
  });
});

describe("focus when the list collapses", () => {
  it("takes focus off a card the collapse is about to remove", () => {
    // On Safari and Firefox the click does not focus the button, so the row unmounts under it.
    openedFor(past.name);
    renderPage();
    jump();

    const toggle = screen.getByRole("button", { name: /^Show fewer/ });
    fireEvent.click(toggle);

    expect(document.activeElement).toBe(toggle);
  });

  it("leaves focus alone on a card that survives the collapse", () => {
    // Preview rows stay mounted, so they keep focus. A whole-grid check took it anyway.
    openedFor(past.name);
    renderPage();
    jump();
    const surviving = document.getElementById(skills[0].name)!;
    surviving.focus();

    fireEvent.click(screen.getByRole("button", { name: /^Show fewer/ }));

    expect(document.activeElement).toBe(surviving);
  });

  it("leaves focus alone when it sits outside the list entirely", () => {
    openedFor(past.name);
    renderPage();
    jump();
    const outside = screen.getByRole("button", { name: /show in list/i });
    outside.focus();

    fireEvent.click(screen.getByRole("button", { name: /^Show fewer/ }));

    expect(document.activeElement).toBe(outside);
  });
});

describe("the wiring between the two", () => {
  it("points the strip's control at the grid that holds the cards", () => {
    // Not merely at *something* with that id: on an ancestor it would contain the control.
    openedFor(past.name);
    renderPage();

    const control = screen.getByRole("button", { name: /show in list/i });
    const target = document.getElementById(
      control.getAttribute("aria-controls")!,
    );
    expect(target).toBeTruthy();
    expect(target!.querySelector(`#${skills[0].name}`)).toBeTruthy();
    expect(target!.contains(control)).toBe(false);
  });

  it("stops listening once the list goes away", () => {
    // Without the cleanups every mount leaves a listener behind.
    const removed: string[] = [];
    const spy = vi
      .spyOn(window, "removeEventListener")
      .mockImplementation((type: string) => void removed.push(type));

    openedFor(past.name);
    renderPage();
    cleanup();
    spy.mockRestore();

    expect(removed).toContain("popstate");
    expect(removed).toContain("korza:skill-focus");
  });
});
