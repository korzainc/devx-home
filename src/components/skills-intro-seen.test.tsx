/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SkillsIntroSeen } from "@/components/skills-intro-seen";
import { INTRO_SEEN_EVENT, INTRO_SEEN_KEY } from "@/lib/skills-intro-seen";

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

describe("recording that the intro was reached", () => {
  it("writes the flag on arrival", () => {
    render(<SkillsIntroSeen />);
    expect(window.localStorage.getItem(INTRO_SEEN_KEY)).toBe("1");
  });

  // The nudge listens on this event, so a same-tab write has to announce itself.
  it("tells this tab, which storage events do not", () => {
    let heard = 0;
    window.addEventListener(INTRO_SEEN_EVENT, () => (heard += 1));
    render(<SkillsIntroSeen />);
    expect(heard).toBe(1);
  });

  it("renders nothing", () => {
    const { container } = render(<SkillsIntroSeen />);
    expect(container.innerHTML).toBe("");
  });

  // A blocked or full store must not take the page down with it.
  it("survives storage refusing the write", () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error("quota");
    };
    try {
      expect(() => render(<SkillsIntroSeen />)).not.toThrow();
    } finally {
      window.localStorage.setItem = original;
    }
  });
});
