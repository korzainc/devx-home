/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SkillPicker, type SkillCard } from "@/components/skill-picker";
import type { Audience } from "@/data/skill-audiences";

afterEach(cleanup);

/**
 * Synthetic cards, because what is worth pinning here is the union rule and the ordering it
 * depends on, not which skills the marketplace happens to publish this week. The home page's own
 * test covers the real pool.
 */
function card(id: string, audiences: Audience[]): SkillCard {
  return {
    id,
    title: `Title ${id}`,
    summary: `Summary ${id}`,
    audiences,
    provenance: "Built at Korza",
  };
}

/** The cards, without the cell holding the marketplace link: that one draws no card. */
function titles() {
  // `queryAll`, because two of these assert on an empty grid and `getAll` throws rather than
  // returning nothing.
  return screen
    .queryAllByRole("heading", { level: 3 })
    .map((h) => h.textContent);
}

function chip(name: string) {
  return screen.getByRole("button", { name });
}

describe("the skill picker", () => {
  it("opens unfiltered, on the front of the pool", () => {
    const cards = Array.from({ length: 8 }, (_, i) =>
      card(`s${i}`, ["Engineering"]),
    );
    render(<SkillPicker cards={cards} />);

    expect(chip("Everyone").getAttribute("aria-pressed")).toBe("true");
    // Five, not eight: the grid is built around six cells and the sixth is the marketplace link.
    expect(titles()).toEqual([
      "Title s0",
      "Title s1",
      "Title s2",
      "Title s3",
      "Title s4",
    ]);
  });

  it("unions the All-tagged skills into whichever audience is picked", () => {
    render(
      <SkillPicker
        cards={[
          card("eng", ["Engineering"]),
          card("any", ["All"]),
          card("sales", ["Sales"]),
        ]}
      />,
    );

    fireEvent.click(chip("Sales"));
    // An All skill is about the thinking rather than the code, so it is nobody's speciality and
    // therefore everybody's. The Engineering one is not for Sales and has to drop.
    expect(titles()).toEqual(["Title sales", "Title any"]);
  });

  /**
   * The reason `forChip` sorts at all. Sales has exactly one skill of its own in the marketplace,
   * and unsorted it would sit behind every All row and fall off the end of the five, leaving the
   * chip showing nothing specific to Sales.
   */
  it("puts the skills that carry the audience ahead of the All ones", () => {
    const cards = [
      ...Array.from({ length: 5 }, (_, i) => card(`any${i}`, ["All"])),
      card("own", ["Sales"]),
    ];
    render(<SkillPicker cards={cards} />);

    fireEvent.click(chip("Sales"));
    expect(titles()[0]).toBe("Title own");
  });

  it("moves the pressed state with the chip", () => {
    render(<SkillPicker cards={[card("eng", ["Engineering"])]} />);

    fireEvent.click(chip("Engineering"));
    expect(chip("Engineering").getAttribute("aria-pressed")).toBe("true");
    expect(chip("Everyone").getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps the marketplace link in the grid when a chip matches nothing", () => {
    render(<SkillPicker cards={[card("eng", ["Engineering"])]} />);

    fireEvent.click(chip("Sales"));
    expect(titles()).toEqual([]);
    // The panel is a taste of the marketplace, so the way through to it cannot depend on the
    // filter having found something.
    expect(
      screen
        .getByRole("link", { name: /Browse the marketplace/ })
        .getAttribute("href"),
    ).toBe("/skills");
  });

  it("draws nothing but the link for an empty pool", () => {
    render(<SkillPicker cards={[]} />);

    expect(titles()).toEqual([]);
    expect(
      screen.getByRole("link", { name: /Browse the marketplace/ }),
    ).toBeTruthy();
  });
});
