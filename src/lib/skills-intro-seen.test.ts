/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  INTRO_ROUTE,
  INTRO_SEEN_KEY,
  INTRO_UNSEEN_ATTR,
  markIntroSeen,
  PRE_PAINT_SCRIPT,
} from "@/lib/skills-intro-seen";

/** What the browser does with the tag: run it, then read the attribute it may have set. */
function runPrePaint() {
  new Function(PRE_PAINT_SCRIPT)();
  return document.documentElement.hasAttribute(INTRO_UNSEEN_ATTR);
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, "", INTRO_ROUTE);
});

afterEach(() => document.documentElement.removeAttribute(INTRO_UNSEEN_ATTR));

describe("the pre-paint reveal", () => {
  it("reveals the overlay for a first-time reader", () => {
    expect(runPrePaint()).toBe(true);
  });

  it("leaves it hidden for a reader who has seen it", () => {
    window.localStorage.setItem(INTRO_SEEN_KEY, "1");
    expect(runPrePaint()).toBe(false);
  });

  /** The script runs on every route, but only one route has an overlay to reveal. */
  it("leaves it hidden everywhere else", () => {
    window.history.replaceState({}, "", "/roadmap");
    expect(runPrePaint()).toBe(false);
  });

  /**
   * Storage can be blocked outright. Hidden is the safe outcome: the overlay would appear on
   * every visit, and a throw here would take down the page before it painted.
   */
  it("leaves it hidden, and does not throw, when storage is blocked", () => {
    const storage = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      expect(runPrePaint()).toBe(false);
    } finally {
      if (storage) Object.defineProperty(window, "localStorage", storage);
    }
  });
});

describe("recording the intro", () => {
  it("hides the overlay, so the CSS does not have to wait for React", () => {
    document.documentElement.setAttribute(INTRO_UNSEEN_ATTR, "");
    markIntroSeen();
    expect(document.documentElement.hasAttribute(INTRO_UNSEEN_ATTR)).toBe(
      false,
    );
  });
});
