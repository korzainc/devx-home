/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
  const trigger = screen
    .getAllByRole("button", { name: new RegExp(`^${escape(facet)}`) })
    .find((node) => node.getAttribute("aria-haspopup") === "true")!;
  if (trigger.getAttribute("aria-expanded") !== "true")
    fireEvent.click(trigger);
  // The count has no space before it, so the accessible name is "go2".
  const option = screen.getByRole("checkbox", {
    name: new RegExp(`^${escape(value)}\\d`),
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
      .filter((node) => node.getAttribute("aria-haspopup") === "true");
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

  it("filters by search text", () => {
    renderPage();
    const eslint = visibleTools.find((tool) => tool.id === "eslint")!;
    fireEvent.change(screen.getByLabelText("Filter tools"), {
      target: { value: eslint.name },
    });

    expect(cardCount()).toBe(1);
    expect(card(eslint.id)).toBeTruthy();
  });

  it("names the rows in the empty state", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText("Filter tools"), {
      target: { value: "zzzznotathing" },
    });
    expect(screen.getByText("No tool matches those filters.")).toBeTruthy();
  });
});
