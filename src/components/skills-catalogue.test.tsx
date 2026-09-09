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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogueTabs } from "@/components/catalogue-tabs";
import { AUDIENCES, skillAudiences } from "@/data/skill-audiences";
import { PluginsCatalogue } from "@/components/plugins-catalogue";
import { SkillsCatalogue } from "@/components/skills-catalogue";
import { entryHaystack, matchesQuery } from "@/lib/search";
import {
  browsableSkills,
  plugins,
  skillFacets,
  skills,
  toolchainSkills,
} from "@/lib/catalogue";
import { CATEGORIES, skillCountByPlugin } from "@/lib/catalogue-entries";

/**
 * The wiring test: lib tests prove the rules, this proves the page uses them. Everything goes
 * through the DOM. The suite it replaces re-implemented the component and missed 13 mutations.
 */

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/skills",
}));

afterEach(cleanup);
beforeEach(() => {
  replace.mockClear();
  // The URL writer reads the live location for the params it does not own, and jsdom carries one
  // document across the file, so a test that seeds a query string would leak into the next.
  window.history.replaceState({}, "", "/skills");
});

function renderPage() {
  render(
    <SkillsCatalogue entries={browsableSkills} toolchain={toolchainSkills} />,
  );
}

/** Skill cards are links to a plugin page; the sidebar contains no such links. */
function cardCount() {
  return screen
    .queryAllByRole("link")
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

/** Audience is the one axis kept in the open, and the only one that is not a facet of the
 *  generated index: its values are chips, while every facet lives inside a closed menu and
 *  reaching one means opening it first. */
const AUDIENCE = "For";

function option(facet: string, value: string) {
  if (facet === AUDIENCE)
    return screen.getByRole("button", { name: value, hidden: false });
  const trigger = screen.getByRole("button", {
    name: new RegExp(`^${escape(facet)}`),
  });
  if (trigger.getAttribute("aria-expanded") !== "true")
    fireEvent.click(trigger);
  // An explicit aria-label now gives the checkbox "codezen, 15 matching" instead of letting the
  // label's own text run the value and count together.
  return screen.getByRole("checkbox", {
    name: new RegExp(`^${escape(value)}, \\d`),
  });
}

function pick(facet: string, value: string) {
  fireEvent.click(option(facet, value));
}

/** A plugin that ships both classified and toolchain rows, so a count taken over the wrong pool
 *  reads differently from one taken over the right one. */
const SHARED_PLUGIN = plugins.find(
  (plugin) =>
    browsableSkills.some((skill) => skill.plugin === plugin.id) &&
    toolchainSkills.some((skill) => skill.plugin === plugin.id),
)!.id;

/**
 * The result count has no visible copy: it is announced to assistive tech only, and debounced so
 * a screen reader isn't read a new number on every keystroke. Callers must hold fake timers.
 */
function settledCount() {
  act(() => {
    vi.advanceTimersByTime(500);
  });
  return screen.getByRole("status").textContent;
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

  it("draws exactly the facets skillFacets defines, and none for category", () => {
    renderPage();
    // Audience is the chip row, so the row carries the label and the values are the buttons.
    expect(screen.getByText("For")).toBeTruthy();
    for (const value of AUDIENCES) {
      expect(
        screen.getByRole("button", { name: value }),
        `${value} is not a chip`,
      ).toBeTruthy();
    }
    for (const label of ["Agent", "Plugin", "Origin"]) {
      expect(
        screen.getByRole("button", { name: new RegExp(`^${label}`) }),
        `${label} is not on screen`,
      ).toBeTruthy();
    }
    // A fourth facet should be a decision, not a drift.
    expect(skillFacets.map((facet) => facet.label)).toEqual([
      "Agent",
      "Plugin",
      "Origin",
    ]);
    // Category heads the sections now, so a control for it would only pick the heading a card
    // already sits under.
    expect(screen.queryByRole("button", { name: /^Category/ })).toBeNull();
  });

  it("groups the unfiltered rows under the categories, in CATEGORIES order", () => {
    renderPage();
    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((node) => node.textContent);
    // Every category the rows actually reach, and nothing else: an empty one is dropped rather
    // than drawn over an empty grid.
    const reached = CATEGORIES.filter((category) =>
      browsableSkills.some((skill) => skill.category === category),
    );
    expect(headings).toEqual([...reached]);
  });

  it("collapses the categories once a filter is on", () => {
    // The headings would then only repeat what the filter row above already says.
    renderPage();
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(
      0,
    );
    pick("Origin", "Korza");
    expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
  });

  it("narrows to a facet and keeps the toolchain rows listed", () => {
    renderPage();
    pick("Origin", "Korza");
    expandToolchain();

    const inOrigin = browsableSkills.filter(
      (skill) => skill.origin === "Korza",
    ).length;
    expect(inOrigin).toBeGreaterThan(0);
    expect(cardCount()).toBe(inOrigin + toolchainSkills.length);
  });

  it("counts a facet over the classified rows only", () => {
    renderPage();
    // The toolchain rows carry a plugin too, so counting them inflates the tally.
    const classified = browsableSkills.filter(
      (skill) => skill.plugin === SHARED_PLUGIN,
    ).length;

    // The option text, not just the card count: leaking the toolchain rows into the tally makes
    // the option read one number while clicking it shows another.
    expect(option("Plugin", SHARED_PLUGIN).closest("label")?.textContent).toBe(
      `${SHARED_PLUGIN}${classified}`,
    );
    pick("Plugin", SHARED_PLUGIN);
    expandToolchain();
    expect(cardCount()).toBe(classified + toolchainSkills.length);
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
        !(skill.summary ?? "").includes("pull request"),
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

  it("returns to the full list when the filter is toggled back off", () => {
    // There is no "Clear all": every filter is visible as a chip or as a count on its own menu,
    // so the control that turned one on is the control that turns it off.
    renderPage();
    pick("Agent", "Codex CLI");
    expect(cardCount()).toBeLessThan(skills.length);

    pick("Agent", "Codex CLI");
    expandToolchain();
    expect(cardCount()).toBe(skills.length);
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
  });

  it("unions the All rows into a specific audience", () => {
    renderPage();
    pick(AUDIENCE, "Sales");

    const tagged = browsableSkills.filter((skill) =>
      skillAudiences[skill.id].includes("Sales"),
    );
    const withAll = browsableSkills.filter((skill) => {
      const mine = skillAudiences[skill.id];
      return mine.includes("Sales") || mine.includes("All");
    });
    // Exact-matching would leave a Sales reader looking at the one card tagged for them, with
    // every cross-functional skill filtered out from under it.
    expect(withAll.length).toBeGreaterThan(tagged.length);
    expect(cardCount()).toBe(withAll.length);
  });

  it("shows only the cross-functional rows when All is picked on its own", () => {
    // Asking for All is asking to see fewer, so the union cannot apply to the value that drives
    // it: every row would satisfy it.
    renderPage();
    pick(AUDIENCE, "All");

    const expected = browsableSkills.filter((skill) =>
      skillAudiences[skill.id].includes("All"),
    );
    expect(expected.length).toBeLessThan(browsableSkills.length);
    expect(cardCount()).toBe(expected.length);
  });

  it("writes the audience pick to the URL, uncoded", () => {
    renderPage();
    pick(AUDIENCE, "Business");
    expect(replace).toHaveBeenLastCalledWith("/skills?for=Business", {
      scroll: false,
    });
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

describe("the plugins catalogue", () => {
  // The card shows a trimmed summary, so the prose beneath it is the only searchable text a
  // plugin has. Trimming the summaries for the card silently emptied the search with it.
  it("searches the prose the card does not show", () => {
    render(
      <PluginsCatalogue
        entries={plugins}
        skillCounts={skillCountByPlugin(skills)}
      />,
    );
    const search = screen.getByLabelText("Filter plugins");

    for (const [query, expected] of [
      ["code review", "mattpocock-skills"],
      ["Wikipedia", "humanizer"],
      ["domain modeling", "mattpocock-skills"],
      ["python", "pyright-lsp"],
    ] as const) {
      fireEvent.change(search, { target: { value: query } });
      expect(
        screen.queryByRole("link", { name: new RegExp(`^${expected}`) }),
        `"${query}" does not find ${expected}`,
      ).toBeTruthy();
    }
  });

  it("does not draw the prose it searches", () => {
    // Paired with the test above: together they pin problem and benefits into the haystack
    // and off the card.
    render(
      <PluginsCatalogue
        entries={plugins}
        skillCounts={skillCountByPlugin(skills)}
      />,
    );
    for (const plugin of plugins) {
      expect(screen.queryByText(plugin.problem)).toBeNull();
      for (const benefit of plugin.benefits) {
        expect(screen.queryByText(benefit)).toBeNull();
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
    //
    // The skill goes in the query string, never the fragment. A fragment is not data to a
    // browser, it is a scroll instruction: the plugin page server-renders its first five cards
    // below the install panel, so `#<name>` landed the page at the bottom before any
    // JavaScript ran, and nothing on the page could opt out of it.
    renderPage();
    const withDistinctName = browsableSkills.find(
      (skill) => skill.name !== skill.plugin,
    )!;
    expect(card(withDistinctName.name)?.getAttribute("href")).toBe(
      `/skills/${withDistinctName.plugin}?skill=${withDistinctName.name}`,
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

describe("a search that only the toolchain matches", () => {
  it("shows those rows rather than an empty grid", () => {
    // The empty state is suppressed while these match, so leaving the section collapsed
    // rendered nothing at all. "superpowers" hit this.
    renderPage();
    const onlyToolchain = "superpowers";
    expect(
      browsableSkills.some((skill) =>
        matchesQuery(onlyToolchain, entryHaystack(skill)),
      ),
    ).toBe(false);
    expect(
      toolchainSkills.some((skill) =>
        matchesQuery(onlyToolchain, entryHaystack(skill)),
      ),
    ).toBe(true);

    fireEvent.change(search(), { target: { value: onlyToolchain } });
    expect(cardCount()).toBeGreaterThan(0);
    expect(screen.queryByText("No skill matches those filters.")).toBeNull();
  });

  it("treats a whitespace query as no query", () => {
    // matchesQuery has no terms to apply, so a space is not a search and must not reveal
    // the toolchain rows. Gating on `query !== ""` instead of on the parsed terms did.
    renderPage();
    expect(card("teach")).toBeNull();
    fireEvent.change(search(), { target: { value: "   " } });
    expect(card("teach")).toBeNull();
  });

  it("does not answer a faceted search with unfaceted rows", () => {
    // The toolchain rows ignore facets, so they cannot be the result of a faceted search.
    renderPage();
    pick("Origin", "Korza");
    fireEvent.change(search(), { target: { value: "bootstrap" } });
    expect(screen.getByText("No skill matches those filters.")).toBeTruthy();
    expect(cardCount()).toBe(0);
  });

  // "teach" is a toolchain row and matches nothing classified, so the counts stay unambiguous.
  it("says on screen what is on screen", () => {
    // The count, the chevron and the empty state each used to read a different set: a search
    // could reveal toolchain rows while the chevron said closed and the count said none. The
    // count carries no visible copy now, so the status region is the only place it is stated,
    // and the only place that disagreement can still be caught.
    vi.useFakeTimers();
    try {
      renderPage();
      const toggle = screen.getByRole("button", {
        name: /^Setup and toolchain/,
      });

      expect(settledCount()).toBe(
        `${browsableSkills.length} of ${skills.length} skills shown.`,
      );

      fireEvent.change(search(), { target: { value: "teach" } });
      expect(toggle.getAttribute("aria-expanded")).toBe("true");
      expect(cardCount()).toBe(1);
      expect(settledCount()).toBe(`1 of ${skills.length} skills shown.`);
      expect(screen.queryByText("No skill matches those filters.")).toBeNull();
    } finally {
      // In a `finally` so a failed assertion above can't leak fake timers into later tests.
      vi.useRealTimers();
    }
  });

  it("does not put the empty state above a visible card", () => {
    // Facets do not reach the toolchain rows, but with the section held open they are on
    // screen, and an empty state above them told the reader the opposite of what they saw.
    vi.useFakeTimers();
    try {
      renderPage();
      expandToolchain();
      fireEvent.change(search(), { target: { value: "teach" } });
      pick("Origin", "Korza");

      expect(cardCount()).toBe(1);
      expect(screen.queryByText("No skill matches those filters.")).toBeNull();
      expect(settledCount()).toBe(`1 of ${skills.length} skills shown.`);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the toggle working while a search has opened the section", () => {
    // Deriving the open state from the search alone left the button pressing against itself.
    renderPage();
    fireEvent.change(search(), { target: { value: "teach" } });
    const toggle = screen.getByRole("button", { name: /^Setup and toolchain/ });

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(cardCount()).toBe(0);
  });

  it("does not claim nothing matches while a collapsed section holds the match", () => {
    // Collapsing search-revealed rows hides them; it does not make the match stop existing.
    renderPage();

    fireEvent.change(search(), { target: { value: "teach" } });
    fireEvent.click(
      screen.getByRole("button", { name: /^Setup and toolchain/ }),
    );

    expect(screen.queryByText("No skill matches those filters.")).toBeNull();
    expect(cardCount()).toBe(0);
  });

  it("still shows the empty state when a facet leaves nothing", () => {
    // The toolchain rows match an empty query, so gating the empty state on them hid it
    // whenever a facet combination found nothing.
    renderPage();
    pick("Plugin", "humanizer");
    pick("Agent", "Codex CLI");
    expect(
      browsableSkills.some(
        (skill) =>
          skill.plugin === "humanizer" && skill.agents.includes("Codex CLI"),
      ),
      "the combination this leans on now matches something",
    ).toBe(false);
    expect(screen.getByText("No skill matches those filters.")).toBeTruthy();
  });
});
