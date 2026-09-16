/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Roll } from "@/components/roll";

/**
 * The list moves on its own for as long as the panel is open, and the stylesheet stops it on two
 * things: hovering, and the attribute this component sets. Only the second one is reachable
 * without a mouse, so it is the one that has to keep working.
 */

afterEach(cleanup);

function track(container: HTMLElement) {
  return container.querySelector(".report-roll")!;
}

function toggle() {
  return screen.getByRole("button", { name: /Pause|Play/ });
}

describe("the rolling report", () => {
  it("starts moving, with a way to stop it", () => {
    const { container } = render(
      <Roll title="owner/repo" meta="1 of 2 missing">
        <p>a row</p>
      </Roll>,
    );

    expect(track(container).hasAttribute("data-paused")).toBe(false);
    expect(toggle().textContent).toBe("Pause");
  });

  it("stops the track and offers to start it again", () => {
    const { container } = render(
      <Roll title="owner/repo" meta="1 of 2 missing">
        <p>a row</p>
      </Roll>,
    );

    fireEvent.click(toggle());
    expect(track(container).hasAttribute("data-paused")).toBe(true);
    // The label says what the button will do next, not what state the list is in.
    expect(toggle().textContent).toBe("Play");

    fireEvent.click(toggle());
    expect(track(container).hasAttribute("data-paused")).toBe(false);
    expect(toggle().textContent).toBe("Pause");
  });

  it("reads the rows once", () => {
    const { container } = render(
      <Roll title="owner/repo" meta="1 of 2 missing">
        <p>a row</p>
      </Roll>,
    );

    // Two copies so the wrap has no gap in it, and the second is scenery: a screen reader that
    // announced both would read the whole report twice.
    const copies = [...track(container).children];
    expect(copies).toHaveLength(2);
    expect(copies.map((copy) => copy.getAttribute("aria-hidden"))).toEqual([
      null,
      "true",
    ]);
  });
});
