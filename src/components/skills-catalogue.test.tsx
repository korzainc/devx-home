/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CatalogueTabs } from "@/components/catalogue-tabs";
import { SkillsCatalogue } from "@/components/skills-catalogue";
import {
  browsableSkills,
  plugins,
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

/** The card for one skill. The name is split across elements, so match the link's own name. */
function card(name: string) {
  return screen.queryByRole("link", { name: new RegExp(`^/${name}\\b`) });
}

function search() {
  return screen.getByLabelText("What are you trying to do?");
}

function escape(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
}

/** Values live inside a closed menu now, so reaching one means opening its facet first. */
function option(facet: string, value: string) {
  // A chip for the same facet is named "Remove Category filter: …", so it cannot collide.
  const trigger = screen.getByRole("button", {
    name: new RegExp(`^${escape(facet)}`),
  });
  if (trigger.getAttribute("aria-expanded") !== "true")
    fireEvent.click(trigger);
  // The count has no space before it, so the accessible name is "Verify7".
  return screen.getByRole("checkbox", {
    name: new RegExp(`^${escape(value)}\\d`),
  });
}

function pick(facet: string, value: string) {
  fireEvent.click(option(facet, value));
}

/** Collapsed by default, so counting its cards means opening it. */
function expandToolchain() {
  const toggle = screen.getByRole("button", { name: /^Setup and toolchain/ });
  if (toggle.getAttribute("aria-expanded") !== "true") fireEvent.click(toggle);
}

describe("the skills catalogue", () => {
  it("lists every skill in the index, classified or not", () => {
    renderPage();
    expandToolchain();
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
    pick("Category", "Verify");
    expandToolchain();

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
    // the chip read "Coordinate11" while clicking it still shows four.
    expect(option("Category", "Coordinate").closest("label")?.textContent).toBe(
      `Coordinate${coordinate}`,
    );
    pick("Category", "Coordinate");
    expandToolchain();
    expect(cardCount()).toBe(coordinate + toolchainSkills.length);
  });

  it("searches the toolchain rows even though it cannot filter them", () => {
    renderPage();
    fireEvent.change(search(), { target: { value: "credentials" } });
    expandToolchain();

    const shown = cardCount();
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(skills.length);
    expect(card("setup")).toBeTruthy();
    // A toolchain row the query does NOT match, or this cannot tell "search reaches them" from
    // "they are always listed in full".
    // Guard first: without it, renaming `teach` upstream makes this pass for the trivial
    // reason and the test silently stops distinguishing anything.
    expect(toolchainSkills.some((skill) => skill.name === "teach")).toBe(true);
    expect(card("teach")).toBeNull();
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
    expect(card(withJob.name)).toBeTruthy();
    for (const job of withJob.jobs) {
      expect(screen.queryByText(job), `"${job}" is on the card`).toBeNull();
    }
  });

  it("clears back to the full list", () => {
    renderPage();
    pick("Category", "Verify");
    expect(cardCount()).toBeLessThan(skills.length);

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expandToolchain();
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
        pick(facet.label, value);
        expect(cardCount(), `${facet.key}=${value}`).toBeGreaterThan(0);
        pick(facet.label, value);
      }
    }
  });
});

describe("the page around the grid", () => {
  it("names the rows in the empty state", () => {
    // Hardcoding the noun, or passing the wrong one, survived every other assertion -- and
    // this string has been the subject of three review rounds.
    renderPage();
    fireEvent.change(search(), { target: { value: "zzzznotathing" } });
    expect(screen.getByText("No skill matches those filters.")).toBeTruthy();
  });

  it("passes the toolchain rows through the tabs", () => {
    // Dropping `toolchain` from the CatalogueTabs call makes the whole section vanish, and
    // rendering SkillsCatalogue directly cannot see it.
    render(
      <CatalogueTabs
        plugins={plugins}
        skills={browsableSkills}
        toolchain={toolchainSkills}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /^Skills/ }));
    expect(
      screen.getByText(`Setup and toolchain`, { exact: false }),
    ).toBeTruthy();
    expect(screen.getByRole("tab", { name: /^Skills/ }).textContent).toContain(
      String(browsableSkills.length + toolchainSkills.length),
    );
  });
});

describe("what a card links to", () => {
  it("points at the plugin that ships the skill, not the skill", () => {
    // generateStaticParams only emits plugin ids, so a name here 404s on every card while
    // the suite stays green: cardCount matches on the /skills/ prefix alone.
    renderPage();
    const withDistinctName = browsableSkills.find(
      (skill) => skill.name !== skill.plugin,
    )!;
    expect(card(withDistinctName.name)?.getAttribute("href")).toBe(
      `/skills/${withDistinctName.plugin}`,
    );
  });
});

describe("the tabs switch panels", () => {
  it("shows one panel at a time, and switching changes which", () => {
    // getByRole respects `hidden`; getByText does not, which is why clicking a tab used to be
    // provable without the click doing anything.
    render(
      <CatalogueTabs
        plugins={plugins}
        skills={browsableSkills}
        toolchain={toolchainSkills}
      />,
    );
    const panel = () =>
      screen.getByRole("tabpanel").getAttribute("aria-labelledby");

    expect(panel()).toBe("catalogue-tab-plugins");
    fireEvent.click(screen.getByRole("tab", { name: /^Skills/ }));
    expect(panel()).toBe("catalogue-tab-skills");
    fireEvent.click(screen.getByRole("tab", { name: /^Plugins/ }));
    expect(panel()).toBe("catalogue-tab-plugins");
  });
});
