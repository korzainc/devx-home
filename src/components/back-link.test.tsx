/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackLink, cameFromApp, markCameFromApp } from "@/components/back-link";

const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back }),
  usePathname: () => "/tools/biome",
}));

afterEach(cleanup);
beforeEach(() => {
  back.mockClear();
  // Each test starts on an unmarked entry, the way a cold arrival does.
  window.history.replaceState(null, "");
});

const link = () => screen.getByRole("link", { name: /CI Tools/ });

function renderLink() {
  render(
    <BackLink followHistory href="/tools">
      CI Tools
    </BackLink>,
  );
}

describe("the back link", () => {
  it("keeps the parent as a real href, whatever it does on click", () => {
    // No-JS, right-click and middle-click all depend on this, so the href is not decorative.
    markCameFromApp();
    renderLink();

    expect(link().getAttribute("href")).toBe("/tools");
  });

  it("follows history when the reader walked here from inside the app", () => {
    // DX-162: the link used to return to /tools even for a reader who came from the gap report,
    // dropping them at the top of a section rather than back where they were.
    markCameFromApp();
    renderLink();

    fireEvent.click(link());
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("lets the href stand for a reader who arrived cold", () => {
    // A deep link, a bookmark or an external referrer: the previous history entry is not ours,
    // so going back would leave the site entirely.
    renderLink();

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link().dispatchEvent(event);

    expect(back).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("lets the href stand on a link that did not opt in", () => {
    // `/skills` and `/tools` carry an up-link labelled "Home". Following history there would land
    // the reader somewhere the label does not name, so the mark is not enough on its own.
    markCameFromApp();
    render(<BackLink href="/">Home</BackLink>);

    const home = screen.getByRole("link", { name: /Home/ });
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    home.dispatchEvent(event);

    expect(back).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves a modified click to the browser", () => {
    // Cmd/ctrl-click means "open this somewhere else", where the href is the whole point.
    markCameFromApp();
    renderLink();

    fireEvent.click(link(), { metaKey: true });
    expect(back).not.toHaveBeenCalled();
  });

  it("leaves a middle click to the browser", () => {
    markCameFromApp();
    renderLink();

    fireEvent.click(link(), { button: 1 });
    expect(back).not.toHaveBeenCalled();
  });

  it("re-reads the mark when a history step swaps the entry underneath it", () => {
    // The mark is per-entry, so going back can change the answer without any code of ours
    // running. Without a popstate subscription the link would keep the previous entry's answer.
    markCameFromApp();
    renderLink();

    window.history.replaceState(null, "");
    fireEvent.popState(window);

    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    link().dispatchEvent(event);

    expect(back).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe("the came-from-app mark", () => {
  it("is absent on a fresh document", () => {
    expect(cameFromApp()).toBe(false);
  });

  it("is set by an in-app navigation", () => {
    markCameFromApp();
    expect(cameFromApp()).toBe(true);
  });

  it("rides the history entry, not the tab", () => {
    // The bug this replaced: a per-tab counter rose on a back step, so a cold deep link →
    // forward → back claimed a safe step back onto the external referrer. State swapped out from
    // under us has to take the answer with it.
    markCameFromApp();
    expect(cameFromApp()).toBe(true);

    window.history.replaceState(null, "");
    expect(cameFromApp()).toBe(false);
  });

  it("keeps the router's own state keys", () => {
    // Next stores its router internals on the same object; clobbering them breaks navigation.
    window.history.replaceState({ __NA: "next-internal" }, "");
    markCameFromApp();

    expect(window.history.state).toMatchObject({
      __NA: "next-internal",
      korzaFromApp: true,
    });
  });

  it("reads a junk or hostile value as absent rather than throwing", () => {
    // Anything on the origin can call replaceState.
    window.history.replaceState({ korzaFromApp: "yes" }, "");
    expect(cameFromApp()).toBe(false);

    window.history.replaceState({ korzaFromApp: 4 }, "");
    expect(cameFromApp()).toBe(false);
  });

  it("survives history being refused outright", () => {
    // A back link that throws would take the page down with it.
    const replaceState = vi
      .spyOn(History.prototype, "replaceState")
      .mockImplementation(() => {
        throw new Error("denied");
      });

    expect(() => markCameFromApp()).not.toThrow();

    replaceState.mockRestore();
  });
});
