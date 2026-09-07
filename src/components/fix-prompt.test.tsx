/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FixPromptButton } from "@/components/fix-prompt";
import { GAP_OPTIONAL_TOGGLE_ID } from "@/lib/gap/optional-toggle";

afterEach(cleanup);

// jsdom 30.0.1 does not implement matchMedia at all, and FixPromptButton's onClick calls it as
// its first statement, so every click here would throw before any assertion ran without this
// stub. `matches: false` means "reduced motion is NOT requested," so the charging-sweep
// setTimeout path always runs and has to be cleared with fake timers instead.
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

// jsdom 30.0.1 has no <dialog> behavior at all — showModal/close are absent, not stubs — and
// PromptOverlay calls showModal unconditionally the moment it mounts, so the dialog needs a
// bare-minimum polyfill to open/close without throwing.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  });
});

const lapMs = 700;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function clickAndAdvance() {
  fireEvent.click(screen.getByRole("button", { name: /generate fix prompt/i }));
  act(() => {
    vi.advanceTimersByTime(lapMs);
  });
}

describe("FixPromptButton", () => {
  it("opens the required-only prompt when the reveal checkbox is unchecked", () => {
    render(
      <>
        <input type="checkbox" id={GAP_OPTIONAL_TOGGLE_ID} />
        <FixPromptButton
          requiredOnlyPrompt="REQUIRED"
          allGapsPrompt="ALL"
          requiredCount={2}
          optionalGapCount={3}
        />
      </>,
    );

    clickAndAdvance();

    expect(screen.getByText("REQUIRED")).toBeTruthy();
    expect(screen.queryByText("ALL")).toBeNull();
    expect(screen.getByText(/2 required checks/)).toBeTruthy();
  });

  it("opens the all-gaps prompt when the reveal checkbox is checked", () => {
    render(
      <>
        <input type="checkbox" id={GAP_OPTIONAL_TOGGLE_ID} />
        <FixPromptButton
          requiredOnlyPrompt="REQUIRED"
          allGapsPrompt="ALL"
          requiredCount={2}
          optionalGapCount={3}
        />
      </>,
    );

    fireEvent.click(screen.getByRole("checkbox"));
    clickAndAdvance();

    expect(screen.getByText("ALL")).toBeTruthy();
    expect(screen.queryByText("REQUIRED")).toBeNull();
    expect(screen.getByText(/5 checks, including 3 optional/)).toBeTruthy();
  });

  it("skips the charging sweep and opens immediately when reduced motion is requested", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    render(
      <>
        <input type="checkbox" id={GAP_OPTIONAL_TOGGLE_ID} />
        <FixPromptButton
          requiredOnlyPrompt="REQUIRED"
          allGapsPrompt="ALL"
          requiredCount={2}
          optionalGapCount={3}
        />
      </>,
    );

    const button = screen.getByRole("button", { name: /generate fix prompt/i });
    fireEvent.click(button);

    // No `vi.advanceTimersByTime` call here: the dialog is already open, with no lap to wait out.
    expect(screen.getByText("REQUIRED")).toBeTruthy();
    expect(button.className).not.toContain("is-charging");
  });

  it("singularizes the dialog subtitle at a count of exactly one", () => {
    render(
      <>
        <input type="checkbox" id={GAP_OPTIONAL_TOGGLE_ID} />
        <FixPromptButton
          requiredOnlyPrompt="REQUIRED"
          allGapsPrompt="ALL"
          requiredCount={1}
          optionalGapCount={0}
        />
      </>,
    );

    clickAndAdvance();

    expect(screen.getByText("1 required check", { exact: false })).toBeTruthy();
    expect(screen.queryByText(/1 required checks/)).toBeNull();
  });
});
