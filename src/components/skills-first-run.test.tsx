/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import type { Root } from "react-dom/client";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkillsFirstRunNudge } from "@/components/skills-first-run";

import {
  INTRO_ROUTE,
  INTRO_SEEN_KEY as KEY,
  INTRO_UNSEEN_ATTR as ATTR,
} from "@/lib/skills-intro-seen";

// The nudge now mounts from the root layout, on every route, and picks its own one.
let pathname = INTRO_ROUTE;
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

afterEach(cleanup);
beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute(ATTR);
  pathname = INTRO_ROUTE;
});

function revealed() {
  return document.documentElement.hasAttribute(ATTR);
}

function dialog() {
  return screen.queryByRole("dialog");
}

/**
 * Clicking a real anchor makes jsdom attempt a navigation it cannot perform, which prints a
 * "Not implemented" notice and leaves noise in an otherwise quiet suite. The click still
 * reaches the component's own handler, which is what these tests are about.
 */
function clickWithoutNavigating(element: HTMLElement) {
  const stop = (event: Event) => event.preventDefault();
  document.addEventListener("click", stop);
  try {
    fireEvent.click(element);
  } finally {
    document.removeEventListener("click", stop);
  }
}

describe("the first-run nudge", () => {
  it("appears on a first visit", () => {
    render(<SkillsFirstRunNudge />);
    expect(dialog()).not.toBeNull();
  });

  /** The correction the design turns on: a skill is not a slash command. */
  it("says most skills fire on their own", () => {
    render(<SkillsFirstRunNudge />);
    expect(screen.getByText(/most fire on their own/)).toBeDefined();
  });

  it("offers the tour and the demo", () => {
    render(<SkillsFirstRunNudge />);
    const hrefs = screen
      .getAllByRole("link")
      .map((node) => node.getAttribute("href"));
    expect(hrefs).toContain("/skills-intro");
    expect(hrefs).toContain("/skills-intro/demo");
  });

  it("stays gone after it is skipped", () => {
    render(<SkillsFirstRunNudge />);
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    expect(dialog()).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBe("1");
  });

  it("does not come back on the next visit", () => {
    window.localStorage.setItem(KEY, "1");
    render(<SkillsFirstRunNudge />);
    expect(dialog()).toBeNull();
  });

  /** Following either link is a decision; it should not greet you again afterwards. */
  /**
   * Deliberately not dismissed on click. Doing so unmounted the overlay while the destination
   * was still loading, exposing the bare catalogue for that moment. The intro pages record the
   * flag on arrival instead, so the overlay stays up until `/skills` unmounts.
   */
  it.each([/Show me around/, /See it run/])(
    "stays up when %s is clicked, so the catalogue is never left bare",
    (name) => {
      render(<SkillsFirstRunNudge />);
      clickWithoutNavigating(screen.getByRole("link", { name }));

      expect(dialog()).not.toBeNull();
      expect(window.localStorage.getItem(KEY)).toBeNull();
    },
  );

  // Skip is the one control that means dismissed without seeing anything, so it still writes.
  it("records the dismissal when it is skipped", () => {
    render(<SkillsFirstRunNudge />);
    fireEvent.click(screen.getByRole("button", { name: /Skip for now/ }));
    expect(window.localStorage.getItem(KEY)).toBe("1");
  });

  it("shows the condensed before and after beside the copy", () => {
    render(<SkillsFirstRunNudge />);
    const text = dialog()?.textContent ?? "";
    expect(text).toContain("same ask, twice");
    expect(text).toContain("write the requirements doc");
    expect(text).toContain("/brainstorm");
    expect(text).toContain("one question at a time");
  });

  /** The case that made the overlay unclosable: reads work, writes throw, as on a full quota. */
  it("still closes when the storage write fails", () => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException("QuotaExceededError");
    };
    try {
      render(<SkillsFirstRunNudge />);
      fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
      expect(dialog()).toBeNull();
    } finally {
      Storage.prototype.setItem = real;
    }
  });

  /** Focus can leave via a backdrop click; Tab has to pull it back, not walk the page behind. */
  it("recaptures Tab when focus has left the dialog", () => {
    render(<SkillsFirstRunNudge />);
    const stops = dialog()!.querySelectorAll<HTMLElement>("a[href], button");
    // Blur, not body.focus(): the body is not focusable, so focusing it leaves the dialog
    // focused and the recapture branch never runs. A backdrop click blurs like this.
    (document.activeElement as HTMLElement).blur();
    expect(dialog()!.contains(document.activeElement)).toBe(false);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(stops[0]);
  });

  /**
   * The attribute is the whole visibility contract: the stylesheet reveals the overlay and
   * locks body scroll under it, which is what lets the pre-paint script do both before React
   * exists. So these assert the attribute, not the styles jsdom would have to compute.
   */
  it("reveals itself, and hides again on dismissal", () => {
    render(<SkillsFirstRunNudge />);
    expect(revealed()).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    expect(revealed()).toBe(false);
  });

  /** Otherwise the scroll lock keyed to it follows the reader onto every other page. */
  it("hides again when the reader leaves the page", () => {
    const view = render(<SkillsFirstRunNudge />);
    view.unmount();
    expect(revealed()).toBe(false);
  });

  it("renders nothing on the routes it does not belong to", () => {
    pathname = "/roadmap";
    render(<SkillsFirstRunNudge />);
    expect(dialog()).toBeNull();
    expect(revealed()).toBe(false);
  });

  /**
   * The markup is now in the served HTML, so a returning reader hydrates it before the store
   * reports the flag. It is hidden by CSS throughout, and must not pull focus on its way out.
   */
  it("does not take focus from a reader who has seen it", () => {
    window.localStorage.setItem(KEY, "1");
    render(<SkillsFirstRunNudge />);
    expect(document.activeElement).toBe(document.body);
  });

  /**
   * The one case `render` cannot show. Hydration replays the server's answer first -- not
   * dismissed -- so for a returning reader there is a commit where the component believes it
   * is open. Reveal it there and the overlay appears for a frame at the one reader it is
   * hidden from, and the end state looks correct afterwards either way. Hence the observer:
   * it asks whether the attribute was ever touched, not where it ended up.
   */
  it("stays hidden through hydration for a reader who has seen it", async () => {
    window.localStorage.setItem(KEY, "1");
    const container = document.createElement("div");
    container.innerHTML = renderToString(<SkillsFirstRunNudge />);
    document.body.appendChild(container);

    const touched: string[] = [];
    const observer = new MutationObserver(() =>
      touched.push(String(revealed())),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [ATTR],
    });
    // Focus is transient in the same way: it lands on the dialog, the dialog leaves, and it
    // falls back to the body looking untouched. Recorded as it happens instead.
    const focused: string[] = [];
    const onFocusIn = (event: FocusEvent) =>
      focused.push((event.target as HTMLElement).nodeName);
    document.addEventListener("focusin", onFocusIn);

    let root: Root | undefined;
    await act(async () => {
      root = hydrateRoot(container, <SkillsFirstRunNudge />);
    });
    observer.disconnect();
    document.removeEventListener("focusin", onFocusIn);

    expect(touched).toEqual([]);
    expect(focused).toEqual([]);
    await act(async () => root?.unmount());
    container.remove();
  });

  /** James's case: another tab sets the flag, so this one closes without a click of its own. */
  it("hands focus off when another tab dismisses it", () => {
    render(
      <>
        <h1>Skills</h1>
        <SkillsFirstRunNudge />
      </>,
    );
    expect(dialog()).not.toBeNull();
    window.localStorage.setItem(KEY, "1");
    fireEvent(window, new Event("storage"));
    expect(dialog()).toBeNull();
    expect(document.activeElement?.tagName).toBe("H1");
  });

  it("leaves focus alone if the reader has already moved on", () => {
    render(
      <>
        <h1>Skills</h1>
        <button type="button">elsewhere</button>
        <SkillsFirstRunNudge />
      </>,
    );
    const elsewhere = screen.getByRole("button", { name: "elsewhere" });
    elsewhere.focus();
    window.localStorage.setItem(KEY, "1");
    fireEvent(window, new Event("storage"));
    expect(document.activeElement).toBe(elsewhere);
  });

  /** The overlay mounts after hydration, so it must not grab focus from someone mid-query. */
  it("leaves focus alone if the reader is already typing", () => {
    render(
      <>
        <input aria-label="search" />
        <SkillsFirstRunNudge />
      </>,
    );
    const input = screen.getByLabelText("search");
    input.focus();
    // Re-render is what the real hydration path does; focus must survive it.
    fireEvent(window, new Event("storage"));
    expect(document.activeElement).toBe(input);
  });

  it("closes on Escape", () => {
    render(<SkillsFirstRunNudge />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog()).toBeNull();
  });

  /**
   * `aria-modal` promises the rest of the page is unavailable. Tab has to wrap, or focus
   * leaves for the catalogue behind the overlay where the focus ring cannot be seen.
   */
  it("wraps Tab inside itself", () => {
    render(<SkillsFirstRunNudge />);
    const stops = dialog()!.querySelectorAll<HTMLElement>("a[href], button");
    const last = stops[stops.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(stops[0]);
  });

  it("wraps Shift+Tab backwards too", () => {
    render(<SkillsFirstRunNudge />);
    const stops = dialog()!.querySelectorAll<HTMLElement>("a[href], button");
    stops[0].focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(stops[stops.length - 1]);
  });

  it("takes focus, so a keyboard reader lands inside it", () => {
    render(<SkillsFirstRunNudge />);
    expect(document.activeElement).toBe(dialog());
  });
});
