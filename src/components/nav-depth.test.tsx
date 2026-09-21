/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cameFromApp } from "@/components/back-link";
import { NavDepth } from "@/components/nav-depth";

let pathname = "/tools/biome";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

afterEach(cleanup);
beforeEach(() => {
  pathname = "/tools/biome";
  window.history.replaceState(null, "");
});

describe("the in-app navigation marker", () => {
  it("leaves the arrival entry unmarked", () => {
    // The entry a document opens on sits in front of wherever the reader came from, which is not
    // ours to go back to.
    render(<NavDepth />);

    expect(cameFromApp()).toBe(false);
  });

  it("marks an entry the reader navigated forward to", () => {
    const view = render(<NavDepth />);

    pathname = "/skills";
    act(() => {
      view.rerender(<NavDepth />);
    });

    expect(cameFromApp()).toBe(true);
  });

  it("does not mark an entry the reader stepped back to", () => {
    // DX-162 follow-up: a back step is a pathname change too. Marking it is how the cold arrival
    // came to claim a safe step back onto the external referrer.
    const view = render(<NavDepth />);

    pathname = "/skills";
    act(() => {
      view.rerender(<NavDepth />);
    });
    expect(cameFromApp()).toBe(true);

    // Back to the arrival: the browser restores that entry's state, then the router catches up.
    window.history.replaceState(null, "");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    pathname = "/tools/biome";
    act(() => {
      view.rerender(<NavDepth />);
    });

    expect(cameFromApp()).toBe(false);
  });

  it("marks again once the reader navigates forward after a back step", () => {
    // The popstate note is spent by the change it explains, not left latched.
    const view = render(<NavDepth />);

    pathname = "/skills";
    act(() => {
      view.rerender(<NavDepth />);
    });

    window.history.replaceState(null, "");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    pathname = "/tools/biome";
    act(() => {
      view.rerender(<NavDepth />);
    });
    expect(cameFromApp()).toBe(false);

    pathname = "/roadmap";
    act(() => {
      view.rerender(<NavDepth />);
    });

    expect(cameFromApp()).toBe(true);
  });
});
