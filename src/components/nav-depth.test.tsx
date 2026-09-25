/**
 * @vitest-environment jsdom
 */
import { StrictMode } from "react";
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
    window.history.replaceState(null, "", "/tools/biome");
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

    window.history.replaceState(null, "", "/tools/biome");
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

  it("leaves the arrival unmarked when Strict Mode runs the effect twice", () => {
    // Development double-invokes effects. A "have we arrived yet" flag cannot survive that: the
    // second run reads the first run's flag and marks the cold arrival, so anyone hand-verifying
    // this fix in `next dev` sees the pre-fix behaviour.
    render(
      <StrictMode>
        <NavDepth />
      </StrictMode>,
    );

    expect(cameFromApp()).toBe(false);
  });

  it("does not let a hash-only back step swallow the next forward mark", () => {
    // A hash link pushes a real history entry but changes no pathname, so stepping back over one
    // never reaches the effect that spends the popstate note. Latched, it ate the next genuine
    // navigation.
    const view = render(<NavDepth />);

    pathname = "/updates";
    act(() => {
      view.rerender(<NavDepth />);
    });
    expect(cameFromApp()).toBe(true);

    // Back over a `#slug` entry: popstate fires while the URL is still `/updates`, only the
    // fragment having moved.
    window.history.replaceState(null, "", "/updates");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    pathname = "/roadmap";
    act(() => {
      view.rerender(<NavDepth />);
    });

    expect(cameFromApp()).toBe(true);
  });
});
