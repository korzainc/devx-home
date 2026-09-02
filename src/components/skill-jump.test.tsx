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
 * The strip sits above the install fold and the list sits below it, with a server component in
 * between, so they cannot share React state. These tests are the contract between them.
 *
 * What is NOT here, because jsdom cannot express it: an `<Activity>` hide/show. Next hides pages
 * rather than unmounting them, and the jump's reset hangs off that. Its proof is a CDP run.
 */

beforeEach(() => {
  // jsdom has no layout engine, so it implements neither of these.
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

// Positions relative to PREVIEW, never hardcoded. The index that matters most is the boundary:
// hardcoded 1-and-17 fixtures straddled it without landing on it, which is how a broken jump
// for exactly one skill stayed invisible.
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

// Scoped to the list: the strip names the target skill too, so an unscoped count reads one
// card more than the grid is actually showing.
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
    // First rows are the plugin's own order, not the target hoisted to the top.
    expect(list().queryByText(skills[0].name)).toBeTruthy();
    expect(list().queryByText(past.name)).toBeNull();
  });

  it("moves neither the viewport nor the scroll position on arrival", () => {
    // Auto-scrolling puts the install commands behind the reader, which is the cost treatment
    // B pays and A does not. `scrollTo` is asserted too: an earlier fix reset the scroll here
    // and stomped the position the browser restores on a reload. Nothing may move the window
    // on arrival.
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
    // Focus, not just scroll: a keyboard user who activates the control is otherwise left on
    // a button at the top of the page while the view moves without them.
    expect(document.activeElement).toBe(card);
    expect(card?.getAttribute("tabindex")).toBe("-1");
    // Centred, not "start": the sticky header would otherwise sit over the card.
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: "center",
    });
  });

  it("reveals the first skill hidden behind the preview", () => {
    // The boundary. One off-by-one in `focusedIndex >= PREVIEW` leaves the grid collapsed for
    // exactly this skill, so its card never mounts and the control does nothing at all.
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
    // The jump forces the grid open from outside its own toggle, so the toggle has to be able
    // to undo it, or the grid is stuck open for the rest of the visit.
    openedFor(past.name);
    renderPage();
    jump();
    expect(shownCount()).toBe(skills.length);

    fireEvent.click(screen.getByRole("button", { name: /^Show fewer/ }));
    expect(shownCount()).toBe(PREVIEW);
  });

  it("moves focus back to the card when the control is used a second time", () => {
    // Reading further down and then reaching for the strip again is the obvious second use.
    // Keyed only on the skill name, the second press is a no-op because the name never changed.
    openedFor(past.name);
    renderPage();
    jump();
    expect(document.activeElement).toBe(document.getElementById(past.name));

    (document.activeElement as HTMLElement).blur();
    jump();

    expect(document.activeElement).toBe(document.getElementById(past.name));
  });

  it("still names the skill after the list collapses again", () => {
    // The strip reads the URL, so anything on this page that rewrites it blanks the strip
    // mid-visit. The list used to clear the URL on collapse for its own reasons.
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
    // A mark on every card identifies nothing, which is the failure the strip exists to
    // prevent. Both halves matter: the ARIA state, and the border a sighted reader sees.
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
    // The subscription's only job. Everything else in this file re-renders for other reasons,
    // so swapping popstate for another event went unnoticed.
    openedFor(past.name);
    renderPage();
    expect(screen.getByText(position(past))).toBeTruthy();

    history.pushState(null, "", `?skill=${inside.name}`);
    // Raw dispatch, not fireEvent: the point is that the store notifies with nothing else
    // prompting a render. act() only flushes what React schedules in response.
    act(() => void window.dispatchEvent(new PopStateEvent("popstate")));

    expect(screen.getByText(position(inside))).toBeTruthy();
  });
});

describe("focus when the list collapses", () => {
  it("takes focus off a card the collapse is about to remove", () => {
    // Clicking a button does not focus it on Safari or Firefox, so the focused row was
    // unmounted underneath focus and the next Tab restarted at the top of the document.
    openedFor(past.name);
    renderPage();
    jump();

    const toggle = screen.getByRole("button", { name: /^Show fewer/ });
    fireEvent.click(toggle);

    expect(document.activeElement).toBe(toggle);
  });

  it("leaves focus alone on a card that survives the collapse", () => {
    // Rows inside the preview stay mounted, so there is no reason to move focus off them.
    // A whole-grid check stole focus from them too.
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
    // Not merely at *something* carrying that id: on an ancestor, aria-controls would name a
    // region containing the control itself, and the toggle would name the heading.
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
    // Both stores hand back a cleanup. Without it every mount leaves a listener behind and a
    // dead component keeps reacting to navigation.
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
