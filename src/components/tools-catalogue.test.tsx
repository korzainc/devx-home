/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolsCatalogue } from "@/components/tools-catalogue";
import { publicToolEntry, visibleTools } from "@/lib/catalogue";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/tools",
}));

afterEach(cleanup);
beforeEach(() => replace.mockClear());

function renderPage() {
  render(<ToolsCatalogue entries={visibleTools.map(publicToolEntry)} />);
}

function renderWithInitial(
  props: { stacks?: string[]; capabilities?: string[] } = {},
) {
  render(
    <ToolsCatalogue
      entries={visibleTools.map(publicToolEntry)}
      initialStacks={props.stacks ?? []}
      initialCapabilities={props.capabilities ?? []}
    />,
  );
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

function search(text: string) {
  fireEvent.change(screen.getByLabelText(/filter tools/i), {
    target: { value: text },
  });
}

function toggleStack(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
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

  it("shows Capability as the only dropdown facet, with Stack as an always-visible chip row", () => {
    renderPage();
    const triggers = screen
      .getAllByRole("button")
      .filter((node) => /[▲▼]$/.test(node.textContent ?? ""));
    expect(
      triggers.map((node) => node.textContent?.replace(/[▲▼]$/, "")),
    ).toEqual(["Capability"]);

    const stackGroup = screen.getByRole("group", { name: "Stack" });
    const stackChips = within(stackGroup).getAllByRole("button");
    expect(stackChips.length).toBeGreaterThan(0);
    for (const chip of stackChips) {
      expect(chip.getAttribute("aria-pressed")).not.toBeNull();
    }
  });

  it("narrows to a stack via the chip row, keeping universal tools visible regardless", () => {
    renderPage();
    toggleStack("go");

    const inStack = visibleTools.filter(
      (tool) => tool.stacks.includes("go") || tool.stacks.includes("any"),
    );
    expect(inStack.length).toBeGreaterThan(0);
    expect(cardCount()).toBe(inStack.length);

    for (const tool of inStack) {
      expect(card(tool.id), `${tool.id} should still be listed`).toBeTruthy();
    }

    // Universal tools (stacks: ["any"]) always show, regardless of which stack chips are
    // active - this is the opposite of exact-matching, deliberately: mandatory checks shouldn't
    // silently drop out of a stack-filtered view.
    const universal = visibleTools.find((tool) => tool.stacks.includes("any"));
    expect(universal, "fixture must contain a universal tool").toBeTruthy();
    expect(
      card(universal!.id),
      `${universal!.id} is universal and must stay visible while "go" is picked`,
    ).toBeTruthy();

    const outOfStack = visibleTools.find(
      (tool) => !tool.stacks.includes("go") && !tool.stacks.includes("any"),
    );
    expect(
      card(outOfStack!.id),
      `${outOfStack!.id} should be filtered out`,
    ).toBeUndefined();
  });

  it("filters by search text, matching a tool's problem and benefits too", () => {
    renderPage();
    const eslint = visibleTools.find((tool) => tool.id === "eslint")!;
    search(eslint.name);

    // Biome's own benefits text names ESLint as the tool it replaces, so searching "ESLint"
    // correctly surfaces both, now that the haystack covers problem/benefits, not just summary.
    expect(cardCount()).toBe(2);
    expect(card(eslint.id)).toBeTruthy();
    expect(card("biome")).toBeTruthy();
  });

  it("removes a section entirely once nothing in it matches", () => {
    renderPage();
    // eslint/biome are the only two tools "ESLint" matches, and both are Code Quality - see
    // Step 0's verification against the real catalogue.
    search("ESLint");
    expect(screen.queryByRole("heading", { name: "Testing" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Security" })).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Staying Current" }),
    ).toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Code Quality" }),
    ).toBeTruthy();
  });

  it("shows a summary line naming the dropped sections", () => {
    renderPage();
    search("ESLint");
    // Only Code Quality has matches, so 3 of 4 sections are dropped, not 1 - the summary counts
    // sections WITH matches ("N of 4 sections").
    expect(screen.getByText(/1 of 4 sections/)).toBeTruthy();
    expect(screen.getByText(/Testing/)).toBeTruthy();
    expect(screen.getByText(/Security/)).toBeTruthy();
    expect(screen.getByText(/Staying Current/)).toBeTruthy();
  });

  it("says all four sections match when nothing dropped", () => {
    renderPage();
    // No filter active at all - every section has at least one tool by construction (all 19
    // visible tools are distributed across exactly these 4 categories today), so this holds
    // with zero setup. The summary line only renders when a filter is active.
    expect(screen.queryByText("All four sections have matches")).toBeNull();

    // Re-assert the positive case under a real filter that still hits all four sections:
    // picking "go" leaves golangci-lint (Code Quality) and go-test (Testing) directly, while
    // the 5 universal tools (always shown regardless of the stack picked) cover Security and
    // Staying Current - verified against the real catalogue in Step 0.
    toggleStack("go");
    expect(screen.getByText("All four sections have matches")).toBeTruthy();
  });

  it("names the rows in the empty state", () => {
    renderPage();
    search("zzzznotathing");
    expect(screen.getByText("No tool matches those filters.")).toBeTruthy();
  });

  it("doesn't let the / shortcut steal focus from an open facet menu", () => {
    renderPage();
    const trigger = screen.getByRole("button", { name: /^Capability/ });
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
    const searchInput = screen.getByLabelText(
      "Filter tools",
    ) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "eslint" } });
    searchInput.focus();
    expect(cardCount()).toBeLessThan(visibleTools.length);

    fireEvent.keyDown(searchInput, { key: "Escape" });

    // Blurring here used to dump focus onto <body>, restarting the next Tab from the top of
    // the page instead of continuing past this field.
    expect(searchInput.value).toBe("");
    expect(cardCount()).toBe(visibleTools.length);
    expect(document.activeElement).toBe(searchInput);
  });

  it("blurs on Escape when the field is already empty, so the key still does something", () => {
    renderPage();
    const searchInput = screen.getByLabelText(
      "Filter tools",
    ) as HTMLInputElement;
    searchInput.focus();
    expect(document.activeElement).toBe(searchInput);

    fireEvent.keyDown(searchInput, { key: "Escape" });

    expect(document.activeElement).not.toBe(searchInput);
  });

  it("announces the settled count and section summary for assistive tech, debounced", () => {
    vi.useFakeTimers();
    try {
      renderPage();
      const status = () => screen.getByRole("status");
      expect(status().textContent).toBe(
        `${visibleTools.length} of ${visibleTools.length} tools shown. All four sections have matches`,
      );

      search("zzzznotathing");
      // The debounce hasn't fired yet - still announcing the pre-search count.
      expect(status().textContent).toBe(
        `${visibleTools.length} of ${visibleTools.length} tools shown. All four sections have matches`,
      );

      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(status().textContent).toBe(
        `0 of ${visibleTools.length} tools shown. 0 of 4 sections · nothing in Code Quality, Testing, Security, Staying Current`,
      );
    } finally {
      // In a `finally` so a failed assertion above can't leak fake timers into later tests.
      vi.useRealTimers();
    }
  });

  it("no longer shows a category badge on the card", () => {
    renderPage();
    const eslint = visibleTools.find((tool) => tool.id === "eslint")!;
    expect(within(card(eslint.id)!).queryByText(eslint.category)).toBeNull();
  });

  it("keeps the Capability facet's own filtering behavior unchanged", () => {
    renderPage();
    const capability = visibleTools[0].capabilities[0];
    pick("Capability", capability);

    const matching = visibleTools.filter((tool) =>
      tool.capabilities.includes(capability),
    );
    expect(cardCount()).toBe(matching.length);
  });

  it("resets search, stack, and capability together on Clear all", () => {
    renderPage();
    // Both eslint and biome (the "eslint" query's two matches) carry the "javascript" stack, so
    // this combination still leaves cards on screen rather than intersecting down to zero.
    search("eslint");
    toggleStack("javascript");
    expect(cardCount()).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));

    expect(
      (screen.getByLabelText("Filter tools") as HTMLInputElement).value,
    ).toBe("");
    expect(
      screen
        .getByRole("button", { name: "javascript" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(cardCount()).toBe(visibleTools.length);
  });

  it("seeds Stack and Capability from the initial props", () => {
    renderWithInitial({ stacks: ["go"] });
    expect(
      screen.getByRole("button", { name: "go" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("shows a picked stack as a removable chip, and removing it un-picks and un-presses it", () => {
    renderPage();
    toggleStack("go");

    const chip = screen.getByRole("button", {
      name: "Remove Stack filter: go",
    });
    expect(chip).toBeTruthy();

    fireEvent.click(chip);

    expect(
      screen.queryByRole("button", { name: "Remove Stack filter: go" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "go" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("updates the URL when a stack chip is toggled, but not on initial mount", () => {
    renderWithInitial();
    expect(replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "go" }));

    expect(replace).toHaveBeenCalledWith(expect.stringContaining("stack=go"), {
      scroll: false,
    });
  });

  it("updates the URL when a capability is picked, comma-joining multiple values", () => {
    renderWithInitial();
    const capability = visibleTools[0].capabilities[0];
    pick("Capability", capability);

    expect(replace).toHaveBeenCalledWith(
      expect.stringContaining(`cap=${capability}`),
      { scroll: false },
    );
  });

  it("clears the URL back to the bare path once every filter is removed", () => {
    renderWithInitial({ stacks: ["go"] });
    fireEvent.click(screen.getByRole("button", { name: "go" }));

    expect(replace).toHaveBeenLastCalledWith("/tools", { scroll: false });
  });
});
