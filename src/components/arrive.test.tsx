/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Arrive } from "@/components/arrive";

/**
 * What is worth pinning is the contract with the stylesheet, which has three states and only one
 * of them is the animation: unarmed means arrived, and that is what a reader with no script or a
 * reader who asked for less motion gets. An entrance stuck armed-but-never-run leaves a stroke
 * invisible and a card at zero opacity, so the failure this guards against is silent.
 */

type Observed = { targets: Element[]; unobserved: Element[] };

let observed: Observed;
let trigger: (entries: { target: Element; isIntersecting: boolean }[]) => void;

function stubObserver() {
  observed = { targets: [], unobserved: [] };
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: unknown[]) => void) {
        trigger = (entries) => act(() => callback(entries));
      }
      observe(target: Element) {
        observed.targets.push(target);
      }
      unobserve(target: Element) {
        observed.unobserved.push(target);
      }
      disconnect() {}
    },
  );
}

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

function marks() {
  return [...document.querySelectorAll<HTMLElement>(".mark")];
}

function cards() {
  return [...document.querySelectorAll<HTMLElement>(".deal")];
}

function paintMarkup() {
  document.body.innerHTML =
    '<span class="mark">one</span><span class="mark">two</span>' +
    '<div class="deal">card</div>';
}

beforeEach(() => {
  paintMarkup();
  stubObserver();
  stubReducedMotion(false);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("running the entrances", () => {
  it("arms every stroke and card, and watches them", () => {
    render(<Arrive />);

    // Both kinds, because they are two rules in one stylesheet and a selector that picked up only
    // the strokes would leave the cards on the document clock, dealt before anyone saw them.
    expect(marks().map((m) => m.dataset.arrive)).toEqual(["off", "off"]);
    expect(cards().map((c) => c.dataset.arrive)).toEqual(["off"]);
    expect(observed.targets).toHaveLength(3);
  });

  it("runs an entrance when its element reaches the screen", () => {
    render(<Arrive />);
    const [first, second] = marks();

    trigger([{ target: first!, isIntersecting: true }]);

    expect(first!.dataset.arrive).toBe("on");
    // Untouched: each one waits for its own panel rather than going off with a neighbour's.
    expect(second!.dataset.arrive).toBe("off");
  });

  it("ignores an element that is only leaving", () => {
    render(<Arrive />);
    const [first] = marks();

    trigger([{ target: first!, isIntersecting: false }]);

    expect(first!.dataset.arrive).toBe("off");
    expect(observed.unobserved).toHaveLength(0);
  });

  it("runs each entrance once", () => {
    render(<Arrive />);
    const [first] = marks();

    trigger([{ target: first!, isIntersecting: true }]);

    // One that replays every time the reader passes it turns emphasis into a tic.
    expect(observed.unobserved).toEqual([first]);
  });

  it("leaves everything arrived when the reader asked for less motion", () => {
    stubReducedMotion(true);
    render(<Arrive />);

    // No attribute at all, which is the stylesheet's arrived state. Arming and then never running
    // would leave the phrase with no emphasis and the card at zero opacity.
    expect(marks().map((m) => m.dataset.arrive)).toEqual([
      undefined,
      undefined,
    ]);
    expect(cards().map((c) => c.dataset.arrive)).toEqual([undefined]);
    expect(observed.targets).toHaveLength(0);
  });
});
