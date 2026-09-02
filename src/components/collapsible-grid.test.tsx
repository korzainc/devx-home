/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollapsibleGrid } from "@/components/collapsible-grid";

afterEach(cleanup);

function items(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    key: `item-${i}`,
    node: <span>Item {i}</span>,
  }));
}

describe("CollapsibleGrid", () => {
  it("renders every item and no show-more control when the count fits the preview", () => {
    render(
      <CollapsibleGrid
        id="grid"
        heading="Tools in this bundle"
        noun="tools"
        items={items(4)}
      />,
    );
    expect(screen.getAllByText(/^Item \d$/)).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /show all/i })).toBeNull();
  });

  it("previews 5 items behind a full count and a show-all button, then expands and collapses", () => {
    render(
      <CollapsibleGrid
        id="grid"
        heading="Skills in this plugin"
        noun="skills"
        items={items(11)}
      />,
    );
    // getByText throws if it's missing, which is the assertion that the heading knows the
    // full count while collapsed, not just the 5 items actually shown.
    screen.getByText("Skills in this plugin (11)");
    expect(screen.getAllByText(/^Item \d+$/)).toHaveLength(5);

    const toggle = screen.getByRole("button", {
      name: /show all 11 skills/i,
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);
    expect(screen.getAllByText(/^Item \d+$/)).toHaveLength(11);
    // Same element throughout: it never unmounts, so focus never drops to the body.
    expect(screen.getByRole("button", { name: /show fewer/i })).toBe(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(toggle);
    expect(screen.getAllByText(/^Item \d+$/)).toHaveLength(5);
    expect(screen.getByRole("button", { name: /show all 11 skills/i })).toBe(
      toggle,
    );
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("offers no control when the count is exactly the preview", () => {
    // `>` and `>=` are indistinguishable at 4 or 11 items.
    render(
      <CollapsibleGrid
        id="grid"
        heading="Skills in this plugin"
        noun="skills"
        items={items(5)}
      />,
    );
    expect(screen.getAllByText(/^Item \d$/)).toHaveLength(5);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("names the grid it expands, so aria-expanded says what is expanding", () => {
    // aria-expanded alone announces a state with no object.
    render(
      <CollapsibleGrid
        id="skills-in-this-plugin"
        heading="Skills in this plugin"
        noun="skills"
        items={items(11)}
      />,
    );
    const toggle = screen.getByRole("button", { name: /show all/i });
    expect(toggle.getAttribute("aria-controls")).toBe("skills-in-this-plugin");
    expect(document.getElementById("skills-in-this-plugin")).toBeTruthy();
  });

  it("renders every item when forceExpanded is set, without the toggle ever being clicked", () => {
    render(
      <CollapsibleGrid
        id="grid"
        heading="Skills in this plugin"
        noun="skills"
        items={items(11)}
        forceExpanded
      />,
    );
    expect(screen.getAllByText(/^Item \d+$/)).toHaveLength(11);
    expect(
      screen
        .getByRole("button", { name: /show fewer/i })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("fires onCollapse when the button collapses the grid, whether expanded via state or forceExpanded", () => {
    const onCollapseFromState = vi.fn();
    render(
      <CollapsibleGrid
        id="grid"
        heading="Skills in this plugin"
        noun="skills"
        items={items(11)}
        onCollapse={onCollapseFromState}
      />,
    );
    const toggle = screen.getByRole("button", { name: /show all/i });
    fireEvent.click(toggle); // expand
    fireEvent.click(toggle); // collapse
    expect(onCollapseFromState).toHaveBeenCalledTimes(1);

    const onCollapseFromForce = vi.fn();
    render(
      <CollapsibleGrid
        id="grid"
        heading="Skills in this plugin"
        noun="skills"
        items={items(11)}
        forceExpanded
        onCollapse={onCollapseFromForce}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /show fewer/i }));
    expect(onCollapseFromForce).toHaveBeenCalledTimes(1);
  });
});
