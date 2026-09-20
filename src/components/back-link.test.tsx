/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackLink, navDepth, recordNavDepth } from "@/components/back-link";

const back = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back }),
  usePathname: () => "/tools/biome",
}));

afterEach(cleanup);
beforeEach(() => {
  back.mockClear();
  window.sessionStorage.clear();
});

const link = () => screen.getByRole("link", { name: /CI Tools/ });

function renderLink() {
  render(<BackLink href="/tools">CI Tools</BackLink>);
}

describe("the back link", () => {
  it("keeps the parent as a real href, whatever it does on click", () => {
    // No-JS, right-click and middle-click all depend on this, so the href is not decorative.
    recordNavDepth();
    renderLink();

    expect(link().getAttribute("href")).toBe("/tools");
  });

  it("follows history when the reader walked here from inside the app", () => {
    // DX-162: the link used to return to /tools even for a reader who came from the gap report,
    // dropping them at the top of a section rather than back where they were.
    recordNavDepth();
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

  it("leaves a modified click to the browser", () => {
    // Cmd/ctrl-click means "open this somewhere else", where the href is the whole point.
    recordNavDepth();
    renderLink();

    fireEvent.click(link(), { metaKey: true });
    expect(back).not.toHaveBeenCalled();
  });

  it("leaves a middle click to the browser", () => {
    recordNavDepth();
    renderLink();

    fireEvent.click(link(), { button: 1 });
    expect(back).not.toHaveBeenCalled();
  });
});

describe("the in-app navigation counter", () => {
  it("starts at nothing on a fresh document", () => {
    expect(navDepth()).toBe(0);
  });

  it("rises with each in-app navigation", () => {
    recordNavDepth();
    expect(navDepth()).toBe(1);
    recordNavDepth();
    expect(navDepth()).toBe(2);
  });

  it("reads a junk or hostile value as nothing rather than throwing", () => {
    // The key is sessionStorage, which anything on the origin can write.
    window.sessionStorage.setItem("korza:nav-depth", "not-a-number");
    expect(navDepth()).toBe(0);

    window.sessionStorage.setItem("korza:nav-depth", "-4");
    expect(navDepth()).toBe(0);
  });

  it("survives storage being refused outright", () => {
    // Safari throws on sessionStorage in a private window rather than returning null, and a
    // back link that throws would take the page down with it.
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("denied");
      });

    expect(navDepth()).toBe(0);
    expect(() => recordNavDepth()).not.toThrow();

    getItem.mockRestore();
  });
});
