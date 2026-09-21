// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GettingStartedEntrance } from "./getting-started-entrance";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  window.location.hash = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// The controller reads the page it does not render, so the shape below has to match
// getting-started/page.tsx: a .getting-started root whose first child section is the hero
// and whose later sections are the ones armed as "waiting".
function mountPage() {
  const root = document.createElement("div");
  root.className = "getting-started";
  root.innerHTML = `
    <section><p class="gs-hero-command">command</p></section>
    <section id="guided">guided</section>
    <section id="manual">manual</section>
    <section id="questions">questions</section>
  `;
  document.body.append(root);
  return {
    root,
    later: [...root.querySelectorAll<HTMLElement>("section")].slice(1),
  };
}

/** Sections start below the fold, so nothing reveals until a listener or the timer fires. */
function stubBelowFold(reduced = false) {
  vi.stubGlobal("innerHeight", 800);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    top: 2000,
  } as DOMRect);
  const media = {
    matches: reduced,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media),
  );
  return media;
}

// Every assertion here is about visibility, because the CSS rule keyed on
// data-entry="waiting" sets opacity: 0. A regression in any reveal path leaves the guided,
// manual and questions sections permanently invisible, and asserting rendered text cannot
// catch that: jsdom reports textContent identically for content at opacity 0.
describe("getting started entrance", () => {
  it("leaves every section visible when reduced motion is preferred", () => {
    stubBelowFold(true);
    const { later } = mountPage();
    render(<GettingStartedEntrance />);
    for (const section of later) expect(section.dataset.entry).toBeUndefined();
  });

  it("arms the sections below the hero, then reveals them on the fallback timer", () => {
    vi.useFakeTimers();
    stubBelowFold();
    const { later } = mountPage();
    render(<GettingStartedEntrance />);
    for (const section of later) expect(section.dataset.entry).toBe("waiting");

    act(() => void vi.advanceTimersByTime(1500));
    for (const section of later) expect(section.dataset.entry).toBe("ready");
  });

  it("reveals on scroll", () => {
    stubBelowFold();
    const { later } = mountPage();
    render(<GettingStartedEntrance />);
    act(() => void fireEvent.scroll(window));
    for (const section of later) expect(section.dataset.entry).toBe("ready");
  });

  it("reveals immediately when focus enters the page", () => {
    stubBelowFold();
    const { root, later } = mountPage();
    render(<GettingStartedEntrance />);
    act(() => void fireEvent.focusIn(root));
    for (const section of later) expect(section.dataset.entry).toBeUndefined();
    act(() => void fireEvent.focusOut(root));
    const command = root.querySelector<HTMLElement>(".gs-hero-command")!;
    expect(command.dataset.entrance).toBe("done");
    expect(command.style.animation).toBe("");
  });

  it("reveals immediately on hash navigation", () => {
    stubBelowFold();
    const { later } = mountPage();
    render(<GettingStartedEntrance />);
    act(() => void fireEvent(window, new Event("hashchange")));
    for (const section of later) expect(section.dataset.entry).toBeUndefined();
  });

  // Unmount is the path with no second chance: a reader who navigates away mid-entrance and
  // returns must not meet a page still holding its sections at opacity 0.
  it("leaves nothing hidden when it unmounts", () => {
    stubBelowFold();
    const { later } = mountPage();
    const view = render(<GettingStartedEntrance />);
    view.unmount();
    for (const section of later) expect(section.dataset.entry).toBeUndefined();
  });
});
