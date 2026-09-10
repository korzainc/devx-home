/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "@/components/account-menu";

let pathname = "/skills";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

/**
 * A `details` closes only by pressing its own summary again, which left the avatar menu sitting
 * over the page while the reader clicked around behind it. These cover the three ways out the
 * hook adds; `NavMenu` is the same hook, so it is not covered twice.
 */

function open() {
  const view = render(
    <AccountMenu trigger={<span>avatar</span>}>
      <button type="button">Log out</button>
    </AccountMenu>,
  );
  const menu = view.container.querySelector("details")!;

  fireEvent.click(screen.getByText("avatar"));
  // jsdom does not toggle `open` from the click the way a browser does, and the listeners hang
  // off the `toggle` event, so opening it is a write plus the event the write would raise.
  menu.open = true;
  fireEvent(menu, new Event("toggle"));

  expect(menu.open).toBe(true);
  return { menu, rerender: view.rerender };
}

afterEach(() => {
  pathname = "/skills";
  cleanup();
});

describe("the account menu", () => {
  it("closes when the pointer goes down outside it", () => {
    const { menu } = open();

    fireEvent(document.body, new Event("pointerdown", { bubbles: true }));

    expect(menu.open).toBe(false);
  });

  it("stays open when the pointer goes down inside it", () => {
    const { menu } = open();

    fireEvent(
      screen.getByText("Log out"),
      new Event("pointerdown", { bubbles: true }),
    );

    expect(menu.open).toBe(true);
  });

  it("closes on Escape and hands focus back to the trigger", () => {
    const { menu } = open();
    const logout = screen.getByText("Log out");
    logout.focus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(menu.querySelector("summary"));
  });

  it("leaves focus alone when Escape is pressed from outside the menu", () => {
    const { menu } = open();
    const elsewhere = document.createElement("button");
    document.body.append(elsewhere);
    elsewhere.focus();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(elsewhere);
  });

  // The header sits in the root layout, so a client side navigation never remounts it.
  it("closes when the path changes under it", () => {
    const { menu, rerender } = open();

    pathname = "/tools";
    rerender(
      <AccountMenu trigger={<span>avatar</span>}>
        <button type="button">Log out</button>
      </AccountMenu>,
    );

    expect(menu.open).toBe(false);
  });

  it("listens to nothing while it is shut", () => {
    const { menu } = open();
    const spy = vi.spyOn(document, "removeEventListener");

    menu.open = false;
    fireEvent(menu, new Event("toggle"));

    // Both listeners come off, so a shut header is not sitting on document handlers.
    expect(spy.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining(["pointerdown", "keydown"]),
    );
    spy.mockRestore();
  });
});
