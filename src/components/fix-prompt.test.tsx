/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FixPromptButton } from "@/components/fix-prompt";

afterEach(cleanup);

// jsdom implements neither dialog method, and the component calls `showModal` on mount.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  });
  // Reduced motion, so the overlay opens on the click rather than after the lap.
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
});

const open = () =>
  fireEvent.click(screen.getByRole("button", { name: /Generate fix prompt/ }));

describe("the fix prompt overlay", () => {
  it("locks the page behind it, and unlocks on dismissal", () => {
    // `overscroll-contain` on the <pre> left the header row, the footer note and the visible
    // backdrop still scrolling the report underneath.
    const { unmount } = render(<FixPromptButton prompt="do the thing" />);
    expect(document.body.style.overflow).not.toBe("hidden");

    open();
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("leaves the page scrollable until it is opened", () => {
    render(<FixPromptButton prompt="do the thing" />);

    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
