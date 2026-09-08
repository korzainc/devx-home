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
  // Anchored: the trigger's own text carries a selection count and an arrow after the label.
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

  it("keeps a section with no matches, showing an empty state under its heading", () => {
    renderPage();
    // eslint/biome are the only two tools "ESLint" matches, and both are Code Quality - see
    // Step 0's verification against the real catalogue.
    search("ESLint");

    // All four headings survive the filter, in the order SECTIONS declares them.
    for (const label of [
      "Code Quality",
      "Testing",
      "Security",
      "Staying Current",
    ]) {
      expect(screen.getByRole("heading", { name: label })).toBeTruthy();
    }

    for (const label of ["Testing", "Security", "Staying Current"]) {
      expect(
        screen.getByText(`Nothing in ${label} matches those filters.`),
      ).toBeTruthy();
    }
    // The section that did match shows cards, not an empty state.
    expect(
      screen.queryByText("Nothing in Code Quality matches those filters."),
    ).toBeNull();
    expect(cardCount()).toBe(2);
  });

  it("shows no per-section empty state when every section matches", () => {
    renderPage();
    // Every section has at least one tool by construction (all 19 visible tools are distributed
    // across exactly these 4 categories today), so this holds with zero setup.
    expect(screen.queryByText(/matches those filters\./)).toBeNull();
  });

  it("shows one message rather than four empty sections when nothing matches at all", () => {
    renderPage();
    search("zzzznotathing");
    expect(screen.getByText("No tool matches those filters.")).toBeTruthy();
    // Zero matches everywhere drops the headings too, so the page isn't four empty sections
    // stacked above each other.
    expect(screen.queryByRole("heading", { name: "Code Quality" })).toBeNull();
    expect(
      screen.queryByText(/Nothing in .* matches those filters\./),
    ).toBeNull();
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

  it("announces the settled count for assistive tech, debounced", () => {
    vi.useFakeTimers();
    try {
      renderPage();
      const status = () => screen.getByRole("status");
      expect(status().textContent).toBe(
        `${visibleTools.length} of ${visibleTools.length} tools shown.`,
      );

      search("zzzznotathing");
      // The debounce hasn't fired yet - still announcing the pre-search count.
      expect(status().textContent).toBe(
        `${visibleTools.length} of ${visibleTools.length} tools shown.`,
      );

      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(status().textContent).toBe(
        `0 of ${visibleTools.length} tools shown.`,
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

  it("seeds Stack and Capability from the initial props", () => {
    const capability = visibleTools[0].capabilities[0];
    renderWithInitial({ stacks: ["go"], capabilities: [capability] });

    expect(
      screen.getByRole("button", { name: "go" }).getAttribute("aria-pressed"),
    ).toBe("true");
    // The ticked box inside the menu is the observable proof the capability was actually
    // picked, not just passed through as an unused prop.
    fireEvent.click(screen.getByRole("button", { name: /^Capability/ }));
    const option = screen.getByRole("checkbox", {
      name: new RegExp(`^${escape(capability)}, \\d`),
    }) as HTMLInputElement;
    expect(option.checked).toBe(true);
  });

  it("un-presses a stack chip when it is toggled back off", () => {
    renderPage();
    toggleStack("go");
    expect(
      screen.getByRole("button", { name: "go" }).getAttribute("aria-pressed"),
    ).toBe("true");

    toggleStack("go");
    expect(
      screen.getByRole("button", { name: "go" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(cardCount()).toBe(visibleTools.length);
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

  it("shows a visible Stack label, not just an accessible name on the group", () => {
    renderPage();
    // Distinct from the group's own accessible name (asserted elsewhere via getByRole("group",
    // { name: "Stack" })) - this confirms real, visible text renders for sighted users too, not
    // only an aria-label a screen reader would announce.
    const label = screen.getByText("Stack");
    expect(label.tagName).toBe("SPAN");
    // The group's accessible name comes from this exact element via aria-labelledby, so the two
    // can never drift out of sync the way a separate aria-label string could.
    expect(
      screen
        .getByRole("group", { name: "Stack" })
        .getAttribute("aria-labelledby"),
    ).toBe(label.id);
  });

  it("orders a section's heading row as label, then note", () => {
    renderPage();
    const heading = screen.getByRole("heading", { name: "Code Quality" });
    const row = heading.parentElement!;
    const children = [...row.children];

    // Two elements, not three: the trailing per-section count is gone, so anything that puts a
    // number back on the heading row fails here rather than only showing up in a screenshot.
    expect(children.length).toBe(2);
    expect(children[0]).toBe(heading);
    // The note is whatever's rendered after the heading - checked by position, not by asserting
    // the exact marketing copy, so this doesn't churn every time the copy is edited.
    expect(children[1]?.textContent).not.toBe("");
  });

  it("states the result count only in the status region, never on screen", () => {
    renderPage();
    const status = screen.getByRole("status");
    const onScreen = [...document.querySelectorAll("span, div, p")].filter(
      (node) =>
        !status.contains(node) && /^\d+ of \d+\b/.test(node.textContent ?? ""),
    );

    expect(onScreen.map((node) => node.textContent)).toEqual([]);
  });
});
