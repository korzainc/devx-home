/**
 * @vitest-environment jsdom
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useSlashShortcut } from "@/lib/slash-shortcut";

afterEach(cleanup);

function setup() {
  const input = document.createElement("input");
  // jsdom never lays out, so offsetParent is always null; stub it the way an element actually
  // attached and visible in the document would report it, since the hook uses it to tell the
  // two mounted catalogue panels apart.
  Object.defineProperty(input, "offsetParent", { value: document.body });
  document.body.appendChild(input);
  const searchRef: RefObject<HTMLInputElement | null> = { current: input };
  return { searchRef, input };
}

/** A real "/" keypress bubbles from whatever element currently has focus (body, absent any
 * other focus) up to the document listener the hook installs. */
function pressSlash(target: Element) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: "/", bubbles: true }),
  );
}

describe("useSlashShortcut", () => {
  it("defaults to enabled", () => {
    const { searchRef } = setup();
    const { result } = renderHook(() => useSlashShortcut(searchRef));
    expect(result.current.enabled).toBe(true);
  });

  it("persists a toggle across independent renderHook calls, proving the module-scope singleton", () => {
    const { searchRef } = setup();
    const first = renderHook(() => useSlashShortcut(searchRef));
    act(() => first.result.current.toggle());
    expect(first.result.current.enabled).toBe(false);

    const second = renderHook(() => useSlashShortcut(searchRef));
    expect(second.result.current.enabled).toBe(false);

    // Leaves the default (on) in place for later tests in this file.
    act(() => second.result.current.toggle());
  });

  it("focuses the given ref on / when enabled", () => {
    const { searchRef, input } = setup();
    renderHook(() => useSlashShortcut(searchRef));

    pressSlash(document.body);

    expect(document.activeElement).toBe(input);
  });

  it("does nothing when disabled", () => {
    const { searchRef, input } = setup();
    const { result } = renderHook(() => useSlashShortcut(searchRef));
    act(() => result.current.toggle());
    expect(result.current.enabled).toBe(false);

    pressSlash(document.body);

    expect(document.activeElement).not.toBe(input);

    // Leaves the default (on) in place for later tests in this file.
    act(() => result.current.toggle());
  });

  it("does nothing when a text input has focus", () => {
    const { searchRef, input } = setup();
    renderHook(() => useSlashShortcut(searchRef));
    const other = document.createElement("input");
    document.body.appendChild(other);
    other.focus();

    pressSlash(other);

    expect(document.activeElement).toBe(other);
    expect(document.activeElement).not.toBe(input);
  });

  it("does nothing when an expanded disclosure has focus", () => {
    const { searchRef, input } = setup();
    renderHook(() => useSlashShortcut(searchRef));
    const disclosure = document.createElement("button");
    disclosure.setAttribute("aria-expanded", "true");
    document.body.appendChild(disclosure);
    disclosure.focus();

    pressSlash(disclosure);

    expect(document.activeElement).toBe(disclosure);
    expect(document.activeElement).not.toBe(input);
  });
});
