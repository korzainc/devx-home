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
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolsCatalogue } from "@/components/tools-catalogue";
import { visibleTools } from "@/lib/catalogue";

afterEach(cleanup);

function renderPage() {
  render(<ToolsCatalogue entries={visibleTools} />);
}

function cardCount() {
  return screen
    .getAllByRole("link")
    .filter((node) => node.getAttribute("href")?.startsWith("/tools/")).length;
}

function card(id: string) {
  return screen
    .queryAllByRole("link")
    .find((node) => node.getAttribute("href") === `/tools/${id}`);
}

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

/** Values live inside a closed menu, so reaching one means opening its facet first. */
function pick(facet: string, value: string) {
  // A chip for the same facet is named "Remove Category filter: …", so it cannot collide.
  const trigger = screen.getByRole("button", {
    name: new RegExp(`^${escape(facet)}`),
  });
  if (trigger.getAttribute("aria-expanded") !== "true")
    fireEvent.click(trigger);
  // An explicit aria-label now gives the checkbox "go, 2 matching" instead of letting the
  // label's own text run the value and count together.
  const option = screen.getByRole("checkbox", {
    name: new RegExp(`^${escape(value)}, \\d`),
  });
  fireEvent.click(option);
}

describe("the tools catalogue", () => {
  it("lists every visible tool", () => {
    renderPage();
    expect(cardCount()).toBe(visibleTools.length);
  });

  it("draws the Category, Capability, and Stack facets, and no others", () => {
    renderPage();
    const triggers = screen
      .getAllByRole("button")
      .filter((node) => /[▲▼]$/.test(node.textContent ?? ""));
    expect(
      triggers.map((node) => node.textContent?.replace(/[▲▼]$/, "")),
    ).toEqual(["Category", "Capability", "Stack"]);
  });

  it("narrows to a stack, keeping only tools that apply to it", () => {
    renderPage();
    pick("Stack", "go");

    const inStack = visibleTools.filter((tool) => tool.stacks.includes("go"));
    expect(inStack.length).toBeGreaterThan(0);
    expect(cardCount()).toBe(inStack.length);

    for (const tool of inStack) {
      expect(card(tool.id), `${tool.id} should still be listed`).toBeTruthy();
    }
    const outOfStack = visibleTools.find((tool) => !tool.stacks.includes("go"));
    expect(
      card(outOfStack!.id),
      `${outOfStack!.id} should be filtered out`,
    ).toBeUndefined();
  });

  it("filters by search text, matching a tool's problem and benefits too", () => {
    renderPage();
    const eslint = visibleTools.find((tool) => tool.id === "eslint")!;
    fireEvent.change(screen.getByLabelText("Filter tools"), {
      target: { value: eslint.name },
    });

    // Biome's own benefits text names ESLint as the tool it replaces, so searching "ESLint"
    // correctly surfaces both, now that the haystack covers problem/benefits, not just summary.
    expect(cardCount()).toBe(2);
    expect(card(eslint.id)).toBeTruthy();
    expect(card("biome")).toBeTruthy();
  });

  it("names the rows in the empty state", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Filter tools"), {
      target: { value: "zzzznotathing" },
    });
    expect(screen.getByText("No tool matches those filters.")).toBeTruthy();
  });

  it("doesn't let the / shortcut steal focus from an open facet menu", () => {
    renderPage();
    const trigger = screen.getByRole("button", { name: /^Stack/ });
    fireEvent.click(trigger);
    trigger.focus();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(trigger, { key: "/" });

    // Stealing focus here, with nothing to close the menu, would leave it open and detached.
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(trigger);
  });

  it("keeps the / shortcut working when storage can't save it, then trusts storage again once it recovers", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("", "QuotaExceededError");
      });
    try {
      renderPage();
      let toggle = screen.getByRole("button", { name: /^Keyboard shortcut/ });

      fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-pressed")).toBe("false");

      // A second flip proves the off state isn't a one-shot fluke of the failed write.
      fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-pressed")).toBe("true");

      setItem.mockRestore();
      // A write that succeeds is trusted again rather than shadowed by the earlier failure -
      // proven by a fresh mount reading real storage, not a stale in-memory value.
      fireEvent.click(toggle);
      cleanup();
      renderPage();
      toggle = screen.getByRole("button", { name: /shortcut/i });
      expect(toggle.getAttribute("aria-pressed")).toBe("false");

      // Leaves the default (on) in place for later tests in this file.
      fireEvent.click(toggle);
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
    } finally {
      setItem.mockRestore();
    }
  });

  it("clears the query on Escape instead of blurring the field", () => {
    renderPage();
    const search = screen.getByLabelText("Filter tools") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "eslint" } });
    search.focus();
    expect(cardCount()).toBeLessThan(visibleTools.length);

    fireEvent.keyDown(search, { key: "Escape" });

    // Blurring here used to dump focus onto <body>, restarting the next Tab from the top of
    // the page instead of continuing past this field.
    expect(search.value).toBe("");
    expect(cardCount()).toBe(visibleTools.length);
    expect(document.activeElement).toBe(search);
  });

  it("announces the settled count for assistive tech, debounced and worded", () => {
    vi.useFakeTimers();
    try {
      renderPage();
      const status = () => screen.getByRole("status");
      expect(status().textContent).toBe(
        `${visibleTools.length} of ${visibleTools.length} tools shown`,
      );

      fireEvent.change(screen.getByLabelText("Filter tools"), {
        target: { value: "zzzznotathing" },
      });
      // The debounce hasn't fired yet - still announcing the pre-search count.
      expect(status().textContent).toBe(
        `${visibleTools.length} of ${visibleTools.length} tools shown`,
      );

      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(status().textContent).toBe(
        `0 of ${visibleTools.length} tools shown`,
      );
    } finally {
      // In a `finally` so a failed assertion above can't leak fake timers into later tests.
      vi.useRealTimers();
    }
  });
});
