/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SkillsCatalogue } from "@/components/skills-catalogue";
import {
  browsableSkills,
  skillFacets,
  skills,
  toolchainSkills,
} from "@/lib/catalogue";

/**
 * The wiring test: lib tests prove the rules, this proves the page uses them. Everything goes
 * through the DOM. The suite it replaces re-implemented the component and missed 13 mutations.
 */

afterEach(cleanup);

function renderPage() {
  render(
    <SkillsCatalogue entries={browsableSkills} toolchain={toolchainSkills} />,
  );
}

/** Skill cards are links to a plugin page; the sidebar contains no such links. */
function cardCount() {
  return screen
    .getAllByRole("link")
    .filter((node) => node.getAttribute("href")?.startsWith("/skills/")).length;
}

function search() {
  return screen.getByLabelText("Search");
}

/** The count has no space before it, so the accessible name is "Verify7" and `\b` never matches. */
function chip(label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
  return screen.getByRole("button", { name: new RegExp(`^${escaped}\\d`) });
}

describe("the skills catalogue", () => {
  it("lists every skill in the index, classified or not", () => {
    renderPage();
    expect(cardCount()).toBe(skills.length);
  });

  it("draws exactly the facets skillFacets defines", () => {
    renderPage();
    for (const facet of skillFacets) {
      expect(
        screen.getByText(facet.label),
        `${facet.label} is not on screen`,
      ).toBeTruthy();
    }
    // A fifth facet should be a decision, not a drift.
    expect(skillFacets).toHaveLength(4);
  });

  it("narrows to a category and keeps the toolchain rows listed", () => {
    renderPage();
    fireEvent.click(chip("Verify"));

    const inCategory = browsableSkills.filter(
      (skill) => skill.category === "Verify",
    ).length;
    expect(inCategory).toBeGreaterThan(0);
    expect(cardCount()).toBe(inCategory + toolchainSkills.length);
  });

  it("counts a category over the classified rows only", () => {
    renderPage();
    // The toolchain rows carry Coordinate too, so counting them would read 11 and show 4.
    const coordinate = browsableSkills.filter(
      (skill) => skill.category === "Coordinate",
    ).length;
    expect(
      toolchainSkills.some((skill) => skill.category === "Coordinate"),
    ).toBe(true);

    // The chip text, not just the card count: leaking the toolchain rows into the tally makes
    // it read "Coordinate11" while eleven of them still filter to four.
    expect(chip("Coordinate").textContent).toBe(`Coordinate${coordinate}`);
    fireEvent.click(chip("Coordinate"));
    expect(cardCount()).toBe(coordinate + toolchainSkills.length);
  });

  it("searches the toolchain rows even though it cannot filter them", () => {
    renderPage();
    fireEvent.change(search(), { target: { value: "credentials" } });

    const shown = cardCount();
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(skills.length);
    expect(screen.getByText("/setup")).toBeTruthy();
    // A toolchain row the query does NOT match, or this cannot tell "search reaches them" from
    // "they are always listed in full".
    // Guard first: without it, renaming `teach` upstream makes this pass for the trivial
    // reason and the test silently stops distinguishing anything.
    expect(toolchainSkills.some((skill) => skill.name === "teach")).toBe(true);
    expect(screen.queryByText("/teach")).toBeNull();
  });

  it("finds a skill by the job it does, not only by its name", () => {
    renderPage();
    fireEvent.change(search(), { target: { value: "pull request" } });

    expect(cardCount()).toBeGreaterThan(0);
    expect(cardCount()).toBeLessThan(skills.length);

    const byJobsOnly = browsableSkills.filter(
      (skill) =>
        skill.jobs.some((job) => job.includes("pull request")) &&
        !skill.summary.includes("pull request"),
    );
    expect(byJobsOnly.length).toBeGreaterThan(0);
  });

  // Paired with the test above: together they pin `jobs` into the haystack and out of the card.
  it("does not draw the jobs it searches", () => {
    renderPage();
    const withJob = browsableSkills.find((skill) =>
      skill.jobs.some((job) => job.includes("pull request")),
    )!;
    expect(screen.getByText(`/${withJob.name}`)).toBeTruthy();
    for (const job of withJob.jobs) {
      expect(screen.queryByText(job), `"${job}" is on the card`).toBeNull();
    }
  });

  it("clears back to the full list", () => {
    renderPage();
    fireEvent.click(chip("Verify"));
    expect(cardCount()).toBeLessThan(skills.length);

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(cardCount()).toBe(skills.length);
  });

  // Why the old "gap in the catalogue" empty state was removed: no chip can match nothing.
  it("never offers a filter that matches no skill", () => {
    renderPage();
    for (const facet of skillFacets) {
      const values = new Set(
        browsableSkills.flatMap((skill) => {
          const value = skill[facet.key as keyof typeof skill];
          return Array.isArray(value) ? value : [String(value)];
        }),
      );
      for (const value of values) {
        fireEvent.click(chip(value));
        expect(cardCount(), `${facet.key}=${value}`).toBeGreaterThan(
          toolchainSkills.length,
        );
        fireEvent.click(chip(value));
      }
    }
  });
});
