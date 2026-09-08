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
import { CHECK_GROUPS, ToolsCatalogue } from "@/components/tools-catalogue";
import {
  capabilityLabels,
  publicToolEntry,
  visibleTools,
} from "@/lib/catalogue";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/tools",
}));

afterEach(cleanup);
beforeEach(() => replace.mockClear());

function renderPage() {
  render(
    <ToolsCatalogue
      entries={visibleTools.map(publicToolEntry)}
      capabilityLabels={capabilityLabels}
    />,
  );
}

function renderWithInitial(
  props: { stacks?: string[]; checks?: string[] } = {},
) {
  render(
    <ToolsCatalogue
      entries={visibleTools.map(publicToolEntry)}
      capabilityLabels={capabilityLabels}
      initialStacks={props.stacks ?? []}
      initialChecks={props.checks ?? []}
    />,
  );
}

/** The order SECTIONS declares them in, which is the order the unfiltered page renders. */
const SECTION_LABELS = [
  "Code Quality",
  "Testing",
  "Security",
  "Dependencies",
];

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

  it("shows Check as the only dropdown facet, with Applies to as an always-visible chip row", () => {
    renderPage();
    const triggers = screen
      .getAllByRole("button")
      .filter((node) => /[▲▼]$/.test(node.textContent ?? ""));
    expect(
      triggers.map((node) => node.textContent?.replace(/[▲▼]$/, "")),
    ).toEqual(["Check"]);

    const stackGroup = screen.getByRole("group", { name: "Applies to" });
    const stackChips = within(stackGroup).getAllByRole("button");
    expect(stackChips.length).toBeGreaterThan(0);
    for (const chip of stackChips) {
      expect(chip.getAttribute("aria-pressed")).not.toBeNull();
    }
  });

  it("narrows to a stack via the chip row, keeping universal tools visible regardless", () => {
    renderPage();
    toggleStack("Go");

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

  it("spells each language its own way and keeps the language-agnostic chip last", () => {
    renderPage();
    const chips = within(screen.getByRole("group", { name: "Applies to" }))
      .getAllByRole("button")
      .map((node) => node.textContent ?? "");

    // Last, not sorted into place: it names a kind of repo, not a language, and alphabetical
    // order on the raw id ("any") would otherwise open the row with it.
    expect(chips.at(-1)).toBe("Language-agnostic");
    // No chip renders a raw taxonomy id. "javascript" is an id; "JavaScript" is the language.
    expect(chips.filter((chip) => /^[a-z]/.test(chip))).toEqual([]);
  });

  it("shows only the language-agnostic tools when that chip is picked alone", () => {
    renderPage();
    toggleStack("Language-agnostic");

    const universal = visibleTools.filter((tool) =>
      tool.stacks.includes("any"),
    );
    expect(universal.length).toBeGreaterThan(0);
    expect(universal.length).toBeLessThan(visibleTools.length);
    expect(cardCount()).toBe(universal.length);
  });

  it("adds nothing when the language-agnostic chip joins a language, since those tools were already in", () => {
    renderPage();
    toggleStack("Go");
    const withGo = cardCount();

    toggleStack("Language-agnostic");

    expect(cardCount()).toBe(withGo);
  });

  it("lists a tool once when it applies to two of the picked languages", () => {
    renderPage();
    // Derived, not hardcoded: a resync that moves these ids around still exercises the overlap
    // rather than quietly passing on a pair that no longer shares a tool.
    const shared = visibleTools.filter(
      (tool) =>
        tool.stacks.includes("javascript") &&
        tool.stacks.includes("typescript"),
    );
    expect(shared.length).toBeGreaterThan(0);

    toggleStack("JavaScript");
    toggleStack("TypeScript");

    for (const tool of shared) {
      expect(
        screen
          .queryAllByRole("link")
          .filter((node) => node.getAttribute("href") === `/tools/${tool.id}`),
      ).toHaveLength(1);
    }
    // The union of both languages, counted once each - not the sum of the two filters.
    const union = visibleTools.filter(
      (tool) =>
        tool.stacks.includes("javascript") ||
        tool.stacks.includes("typescript") ||
        tool.stacks.includes("any"),
    );
    expect(cardCount()).toBe(union.length);
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

  it("collapses to one flat grid while filtering, with no section headings", () => {
    renderPage();
    // eslint/biome are the only two tools "ESLint" matches, and both are Code Quality - see
    // Step 0's verification against the real catalogue.
    search("ESLint");

    // The sections are the capability categories, so grouping a filtered view puts every match
    // under one heading and leaves the rest with nothing to show. None render while filtering.
    for (const label of SECTION_LABELS) {
      expect(screen.queryByRole("heading", { name: label })).toBeNull();
    }
    expect(screen.queryByText(/^Nothing in /)).toBeNull();
    expect(cardCount()).toBe(2);
  });

  it("restores the section headings once the filter is cleared", () => {
    renderPage();
    search("ESLint");
    search("");

    for (const label of SECTION_LABELS) {
      expect(screen.getByRole("heading", { name: label })).toBeTruthy();
    }
    expect(cardCount()).toBe(visibleTools.length);
  });

  it("groups every tool under a heading when nothing is filtering", () => {
    renderPage();
    // All 19 visible tools fall in exactly these 4 categories today, so an unfiltered page shows
    // four headings and no empty state at all.
    expect(screen.queryByText(/matches those filters\./)).toBeNull();
    const headed = SECTION_LABELS.reduce((sum, label) => {
      const heading = screen.getByRole("heading", { name: label });
      const section = heading.closest("section");
      return (
        sum +
        (section
          ? within(section)
              .getAllByRole("link")
              .filter((node) =>
                node.getAttribute("href")?.startsWith("/tools/"),
              ).length
          : 0)
      );
    }, 0);
    // No tool renders outside a section, which is what lets the filtered grid flatten the
    // sections instead of using the unsectioned list.
    expect(headed).toBe(cardCount());
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
    const trigger = screen.getByRole("button", { name: /^Check/ });
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

  it("offers the Check groups rather than the raw capabilities behind them", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Check/ }));

    const options = screen
      .getAllByRole("checkbox")
      .map((node) => node.getAttribute("aria-label")?.replace(/, \d+.*$/, ""));
    expect(options).toEqual(CHECK_GROUPS.map((group) => group.label));
  });

  it("filters by the whole group, matching every capability it covers", () => {
    renderPage();
    const group = CHECK_GROUPS.find((entry) => entry.id === "linting")!;
    pick("Check", group.label);

    const matching = visibleTools.filter((tool) =>
      tool.capabilities.some((capability) =>
        group.capabilities.includes(capability),
      ),
    );
    // Strictly wider than any single capability in the group, which is the whole reason the
    // group exists: picking it must not behave like picking its most popular member.
    const widest = Math.max(
      ...group.capabilities.map(
        (capability) =>
          visibleTools.filter((tool) => tool.capabilities.includes(capability))
            .length,
      ),
    );
    expect(matching.length).toBeGreaterThan(widest);
    expect(cardCount()).toBe(matching.length);
  });

  it("counts a tool once against a group it matches twice", () => {
    renderPage();
    // Biome carries lint-style and format, both in Code Linting. Counting values instead of
    // entries would list it twice and put a number on the menu no click can reproduce.
    const biome = visibleTools.find((tool) => tool.id === "biome")!;
    expect(
      biome.capabilities.filter((capability) =>
        ["lint-style", "format"].includes(capability),
      ).length,
    ).toBe(2);

    fireEvent.click(screen.getByRole("button", { name: /^Check/ }));
    const option = screen.getByRole("checkbox", {
      name: new RegExp(`^${escape("Code Linting")}, \\d`),
    });
    const shown = Number(
      /(\d+)/.exec(option.getAttribute("aria-label") ?? "")?.[1],
    );

    fireEvent.click(option);
    expect(cardCount()).toBe(shown);
  });

  it("seeds Applies to and Check from the initial props", () => {
    renderWithInitial({ stacks: ["go"], checks: ["linting"] });

    expect(
      screen.getByRole("button", { name: "Go" }).getAttribute("aria-pressed"),
    ).toBe("true");
    // The ticked box inside the menu is the observable proof the group was actually picked, not
    // just passed through as an unused prop.
    fireEvent.click(screen.getByRole("button", { name: /^Check/ }));
    const option = screen.getByRole("checkbox", {
      name: new RegExp(`^${escape("Code Linting")}, \\d`),
    }) as HTMLInputElement;
    expect(option.checked).toBe(true);
  });

  it("un-presses a stack chip when it is toggled back off", () => {
    renderPage();
    toggleStack("Go");
    expect(
      screen.getByRole("button", { name: "Go" }).getAttribute("aria-pressed"),
    ).toBe("true");

    toggleStack("Go");
    expect(
      screen.getByRole("button", { name: "Go" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(cardCount()).toBe(visibleTools.length);
  });

  it("updates the URL when a stack chip is toggled, but not on initial mount", () => {
    renderWithInitial();
    expect(replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Go" }));

    expect(replace).toHaveBeenCalledWith(expect.stringContaining("stack=go"), {
      scroll: false,
    });
  });

  it("puts the picked Check group's id in the URL, not the capabilities behind it", () => {
    renderWithInitial();
    pick("Check", "Code Linting");

    // One short slug rather than the four capability ids it expands to, so a shared link reads
    // as the thing the sender actually clicked.
    expect(replace).toHaveBeenCalledWith(
      expect.stringContaining("check=linting"),
      { scroll: false },
    );
  });

  it("clears the URL back to the bare path once every filter is removed", () => {
    renderWithInitial({ stacks: ["go"] });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));

    expect(replace).toHaveBeenLastCalledWith("/tools", { scroll: false });
  });

  it("shows a visible Applies to label, not just an accessible name on the group", () => {
    renderPage();
    // Distinct from the group's own accessible name (asserted elsewhere via getByRole("group",
    // { name: "Applies to" })) - this confirms real, visible text renders for sighted users too,
    // not only an aria-label a screen reader would announce.
    const label = screen.getByText("Applies to");
    expect(label.tagName).toBe("SPAN");
    // The group's accessible name comes from this exact element via aria-labelledby, so the two
    // can never drift out of sync the way a separate aria-label string could.
    expect(
      screen
        .getByRole("group", { name: "Applies to" })
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
