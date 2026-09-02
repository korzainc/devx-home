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

/** A same-route navigation re-renders the page without unmounting anything. */
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

describe("arriving from a skill card", () => {
  it("lands with the list collapsed and in its own order, even for a skill past the preview", () => {
    // The whole point of treatment A: the strip carries the answer, so the list does not have
    // to reorder or unfold itself to deliver it.
    const target = skills[17];
    openedFor(target.name);
    renderPage();

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
    renderPage();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("reveals the skill and moves focus onto its card when Show in list is used", () => {
    const target = skills[17];
    openedFor(target.name);
    renderPage();

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
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /show in list/i }));

    expect(shownCount()).toBe(5);
    expect(document.activeElement).toBe(document.getElementById(target.name));
  });

  it("collapses again after a jump", () => {
    // The jump forces the grid open from outside its own toggle, so the toggle has to be able
    // to undo it, or the grid is stuck open for the rest of the visit.
    openedFor(skills[17].name);
    renderPage();

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
    renderPage();
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
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /show in list/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Show fewer/ }));

    expect(screen.getByText("Opened for")).toBeTruthy();
    expect(
      screen.getByText(`18 of ${skills.length} in this plugin`),
    ).toBeTruthy();
  });

  it("marks the card the page was opened for", () => {
    // The strip names it above the fold; the mark is what identifies it once you are looking
    // at the list. Derived from the URL rather than held as state, so it cannot outlive it.
    const target = skills[1];
    openedFor(target.name);
    renderPage();

    expect(
      document.getElementById(target.name)?.getAttribute("aria-current"),
    ).toBe("true");
  });

  it("moves the mark and drops the jump when another skill in the plugin is opened", () => {
    // Models leaving to /skills and opening a second skill of the same plugin: Next hides the
    // page with `<Activity>` rather than unmounting it, so this state survives while the URL
    // moves on. Without the reset the list stayed expanded on the old card, still marked and
    // still focused, while the strip already named the new one.
    //
    // Not a model of a query-only navigation within this route. That one does not re-render at
    // all in 16.3.1, so no test can reproduce it here; see subscribeToLocation's comment.
    const first = skills[17];
    openedFor(first.name);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /show in list/i }));
    expect(shownCount()).toBe(skills.length);

    const second = skills[1];
    history.pushState(null, "", `?skill=${second.name}`);
    rerenderPage();

    expect(shownCount()).toBe(5);
    expect(
      document.getElementById(second.name)?.getAttribute("aria-current"),
    ).toBe("true");
    expect(document.getElementById(first.name)).toBeNull();
  });

  it("points the strip's control at the list it expands", () => {
    openedFor(skills[17].name);
    renderPage();

    const control = screen.getByRole("button", { name: /show in list/i });
    const listId = control.getAttribute("aria-controls");
    expect(listId).toBeTruthy();
    expect(document.getElementById(listId!)).toBeTruthy();
  });
});

describe("state that must not outlive the URL", () => {
  it("marks only the skill the page was opened for", () => {
    // A mark on every card identifies nothing, which is the failure the strip exists to
    // prevent. The positive assertions above pass either way.
    openedFor(skills[1].name);
    renderPage();

    expect(
      [...document.querySelectorAll("[aria-current]")].map((node) => node.id),
    ).toEqual([skills[1].name]);
  });

  it("returns to the top when a different skill is opened", () => {
    // A hidden `<Activity>` tree keeps the scroll offset a jump left behind, so the second
    // visit landed mid-page — the same complaint the URL fragment caused.
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);

    openedFor(skills[17].name);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /show in list/i }));
    scrollTo.mockClear();

    history.pushState(null, "", `?skill=${skills[1].name}`);
    rerenderPage();

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("does not revive a jump when the same skill is opened again", () => {
    // The jump was cleared rather than masked. Masking left the object identity intact, so
    // coming back to the skill it belonged to re-fired the expand, the scroll and the focus.
    const first = skills[17];
    openedFor(first.name);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /show in list/i }));

    history.pushState(null, "", `?skill=${skills[1].name}`);
    rerenderPage();
    history.pushState(null, "", `?skill=${first.name}`);
    rerenderPage();

    expect(shownCount()).toBe(5);
    expect(document.activeElement).not.toBe(
      document.getElementById(first.name),
    );
  });

  it("updates on back and forward, with no re-render to lean on", () => {
    // The subscription's only job. Everything else in this file re-renders for other reasons,
    // so swapping popstate for another event went unnoticed.
    openedFor(skills[17].name);
    renderPage();
    expect(
      screen.getByText(`18 of ${skills.length} in this plugin`),
    ).toBeTruthy();

    history.pushState(null, "", `?skill=${skills[1].name}`);
    // Raw dispatch, not fireEvent: the point is that the store notifies with nothing else
    // prompting a render. act() only flushes what React schedules in response.
    act(() => void window.dispatchEvent(new PopStateEvent("popstate")));

    expect(
      screen.getByText(`2 of ${skills.length} in this plugin`),
    ).toBeTruthy();
  });

  it("keeps focus reachable when collapsing removes the focused card", () => {
    // Clicking a button does not focus it on Safari or Firefox, so the focused row was
    // unmounted underneath focus and the next Tab restarted at the top of the document.
    openedFor(skills[17].name);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /show in list/i }));

    const toggle = screen.getByRole("button", { name: /^Show fewer/ });
    fireEvent.click(toggle);

    expect(document.activeElement).toBe(toggle);
  });
});
