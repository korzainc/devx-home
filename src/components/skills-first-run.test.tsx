/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SkillsFirstRunNudge } from "@/components/skills-first-run";

import { INTRO_SEEN_KEY as KEY } from "@/lib/skills-intro-seen";

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

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

  // Dismissing on click exposed the bare catalogue while the destination loaded.
  // The intro pages record the flag on arrival instead.
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

  it("locks the page behind it, and unlocks on dismissal", () => {
    render(<SkillsFirstRunNudge />);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: /Skip/ }));
    expect(document.body.style.overflow).not.toBe("hidden");
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
