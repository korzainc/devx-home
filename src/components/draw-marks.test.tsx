/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrawMarks } from "@/components/draw-marks";

/**
 * What is worth pinning is the contract with the stylesheet, which has three states and only one
 * of them is the animation: unarmed means painted, and that is what a reader with no script or a
 * reader who asked for less motion gets. A stroke stuck armed-but-never-drawn is invisible, so
 * the failure this guards against is silent.
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

function paintMarkup() {
  document.body.innerHTML =
    '<span class="mark">one</span><span class="mark">two</span>';
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

describe("drawing the brush strokes", () => {
  it("arms every stroke and watches it", () => {
    render(<DrawMarks />);

    expect(marks().map((m) => m.dataset.draw)).toEqual(["off", "off"]);
    expect(observed.targets).toHaveLength(2);
  });

  it("draws a stroke when its phrase reaches the screen", () => {
    render(<DrawMarks />);
    const [first, second] = marks();

    trigger([{ target: first, isIntersecting: true }]);

    expect(first.dataset.draw).toBe("on");
    // Untouched: each stroke waits for its own panel rather than going off with a neighbour's.
    expect(second.dataset.draw).toBe("off");
  });

  it("ignores a phrase that is only leaving", () => {
    render(<DrawMarks />);
    const [first] = marks();

    trigger([{ target: first, isIntersecting: false }]);

    expect(first.dataset.draw).toBe("off");
    expect(observed.unobserved).toHaveLength(0);
  });

  it("draws each stroke once", () => {
    render(<DrawMarks />);
    const [first] = marks();

    trigger([{ target: first, isIntersecting: true }]);

    // A stroke that redraws every time the reader passes it turns emphasis into a tic.
    expect(observed.unobserved).toEqual([first]);
  });

  it("leaves the strokes painted when the reader asked for less motion", () => {
    stubReducedMotion(true);
    render(<DrawMarks />);

    // No attribute at all, which is the stylesheet's painted state. Arming and then never
    // drawing would leave the phrase with no emphasis on it.
    expect(marks().map((m) => m.dataset.draw)).toEqual([undefined, undefined]);
    expect(observed.targets).toHaveLength(0);
  });
});
