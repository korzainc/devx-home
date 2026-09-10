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
import { skillLink } from "@/lib/skill-link";
import { plugins, skillFacets, skills } from "@/lib/catalogue";
import { CATEGORIES } from "@/data/skill-categories";
import { skillCountByPlugin } from "@/lib/catalogue-entries";

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
  render(<SkillsCatalogue entries={skills} />);
}

/** Skill cards are links to a plugin page; the sidebar contains no such links. */
function cardCount() {
  return screen
    .queryAllByRole("link")
    .filter((node) => node.getAttribute("href")?.startsWith("/skills/")).length;
}

/** The rows on screen, in the order they are drawn. Resolved through the href rather than the
 *  name, because two plugins can ship a skill of the same name. */
function onScreen() {
  const byHref = new Map(
    skills.map((skill) => [skillLink(skill.plugin, skill.name), skill]),
  );
  return screen
    .queryAllByRole("link")
    .map((node) => byHref.get(node.getAttribute("href") ?? ""))
    .filter((skill) => skill !== undefined);
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

/** Setup and meta rows: they sit under the same headings as everything else, but sort last and
 *  carry a marker. Named by kind rather than by id, so a sync that adds one is covered. */
const TOOLCHAIN = skills.filter((skill) => skill.kind !== "skill");

/** A plugin that ships both kinds, so a facet count taken over only one of them reads
 *  differently from one taken over both. */
const SHARED_PLUGIN = plugins.find(
  (plugin) =>
    skills.some(
      (skill) => skill.plugin === plugin.id && skill.kind === "skill",
    ) && TOOLCHAIN.some((skill) => skill.plugin === plugin.id),
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

describe("the skills catalogue", () => {
  it("lists every skill in the index, under a heading, with nothing set aside", () => {
    renderPage();
    expect(cardCount()).toBe(skills.length);
    // The band these rows used to sit in is gone: they are in the sections now, which is what
    // makes the facets and the headings reach them at all.
    expect(TOOLCHAIN.length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Setup and toolchain/)).toBeNull();
    const drawn = new Set(onScreen().map((skill) => skill.id));
    for (const skill of TOOLCHAIN)
      expect(drawn.has(skill.id), skill.id).toBe(true);
  });

  it("marks the setup and meta rows, and sorts them last under their heading", () => {
    renderPage();
    // Without the marker a reader scanning Make cannot tell a skill that does the work from one
    // that configures the toolchain, since both now read as ordinary cards.
    expect(screen.getAllByText("tooling").length).toBe(TOOLCHAIN.length);

    const drawn = onScreen();
    for (const category of CATEGORIES) {
      const kinds = drawn
        .filter((skill) => skill.category === category)
        .map((skill) => skill.kind !== "skill");
      // Once true, never false again: every setup or meta row follows every ordinary one.
      expect(kinds, category).toEqual([...kinds].sort());
    }
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
      skills.some((skill) => skill.category === category),
    );
    expect(headings).toEqual([...reached]);
  });

  it("keeps the categories once a filter is on, unlike /tools", () => {
    // Audience cuts across every heading, so which kinds of work a pick reaches is information
    // the filter row cannot give. A heading the pick empties is still dropped.
    renderPage();
    pick(AUDIENCE, "Business");

    const headings = screen
      .getAllByRole("heading", { level: 2 })
      .map((node) => node.textContent);
    const reached = CATEGORIES.filter((category) =>
      skills.some(
        (skill) =>
          skill.category === category &&
          (skill.audiences.includes("Business") ||
            skill.audiences.includes("All")),
      ),
    );
    expect(headings).toEqual([...reached]);
    expect(headings.length).toBeGreaterThan(1);
  });

  it("narrows to a facet, and the facet reaches the setup and meta rows too", () => {
    renderPage();
    pick("Origin", "Korza");

    const inOrigin = skills.filter((skill) => skill.origin === "Korza");
    expect(inOrigin.length).toBeGreaterThan(0);
    expect(inOrigin.length).toBeLessThan(skills.length);
    expect(cardCount()).toBe(inOrigin.length);
    // The point of the fold: origin, plugin and agent were always on these rows, and routing
    // them around the facets was the only thing keeping a pick from finding them.
    expect(inOrigin.some((skill) => skill.kind !== "skill")).toBe(true);
  });

  it("counts a facet over every row it will show, both kinds", () => {
    renderPage();
    const inPlugin = skills.filter(
      (skill) => skill.plugin === SHARED_PLUGIN,
    ).length;

    // The option text, not just the card count: counting one pool and filtering another makes
    // the option read one number while clicking it shows a different one.
    expect(option("Plugin", SHARED_PLUGIN).closest("label")?.textContent).toBe(
      `${SHARED_PLUGIN}${inPlugin}`,
    );
    pick("Plugin", SHARED_PLUGIN);
    expect(cardCount()).toBe(inPlugin);
  });

  it("searches the setup and meta rows", () => {
    renderPage();
    fireEvent.change(search(), { target: { value: "credentials" } });

    const shown = onScreen();
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(skills.length);
    expect(shown.some((skill) => skill.id === "codezen:skills/setup")).toBe(
      true,
    );
    // A setup or meta row the query does NOT match, or this cannot tell "search reaches them"
    // from "they are always listed in full".
    expect(TOOLCHAIN.some((skill) => skill.name === "teach")).toBe(true);
    expect(shown.some((skill) => skill.name === "teach")).toBe(false);
  });

  it("finds a skill by the job it does, not only by its name", () => {
    renderPage();
    fireEvent.change(search(), { target: { value: "pull request" } });

    expect(cardCount()).toBeGreaterThan(0);
    expect(cardCount()).toBeLessThan(skills.length);

    const byJobsOnly = skills.filter(
      (skill) =>
        skill.jobs.some((job) => job.includes("pull request")) &&
        !(skill.summary ?? "").includes("pull request"),
    );
    expect(byJobsOnly.length).toBeGreaterThan(0);
  });

  // Paired with the test above: together they pin `jobs` into the haystack and out of the card.
  it("does not draw the jobs it searches", () => {
    renderPage();
    const withJob = skills.find((skill) =>
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
    expect(cardCount()).toBe(skills.length);
    expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
  });

  it("unions the All rows into a specific audience", () => {
    renderPage();
    pick(AUDIENCE, "Sales");

    const tagged = skills.filter((skill) =>
      skillAudiences[skill.id].includes("Sales"),
    );
    const withAll = skills.filter((skill) => {
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

    const expected = skills.filter((skill) =>
      skillAudiences[skill.id].includes("All"),
    );
    expect(expected.length).toBeLessThan(skills.length);
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
        skills.flatMap((skill) => {
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
      // Matches `problem` and nothing else, so the field stays in the haystack on its own.
      ["diagnosing", "mattpocock-skills"],
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

  it("passes the whole pool through the tabs, setup and meta rows included", () => {
    // The tab count and the grid read the same array now. Handing the panel a filtered one
    // would leave the tab promising rows the grid never draws.
    render(<CatalogueTabs plugins={plugins} skills={skills} />);
    fireEvent.click(screen.getByRole("tab", { name: /^Skills/ }));
    expect(cardCount()).toBe(skills.length);
    expect(screen.getByRole("tab", { name: /^Skills/ }).textContent).toContain(
      String(skills.length),
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
    const withDistinctName = skills.find(
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
    render(<CatalogueTabs plugins={plugins} skills={skills} />);
    const panel = () =>
      screen.getByRole("tabpanel").getAttribute("aria-labelledby");

    expect(panel()).toBe("catalogue-tab-plugins");
    fireEvent.click(screen.getByRole("tab", { name: /^Skills/ }));
    expect(panel()).toBe("catalogue-tab-skills");
    fireEvent.click(screen.getByRole("tab", { name: /^Plugins/ }));
    expect(panel()).toBe("catalogue-tab-plugins");
  });
});

describe("a search that only the setup and meta rows match", () => {
  it("shows those rows rather than an empty grid", () => {
    renderPage();
    const onlyToolchain = "superpowers";
    const matched = skills.filter((skill) =>
      matchesQuery(onlyToolchain, entryHaystack(skill)),
    );
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.every((skill) => skill.kind !== "skill")).toBe(true);

    fireEvent.change(search(), { target: { value: onlyToolchain } });
    expect(cardCount()).toBe(matched.length);
    expect(screen.queryByText("No skill matches those filters.")).toBeNull();
  });

  it("treats a whitespace query as no query", () => {
    // matchesQuery has no terms to apply, so a space must not narrow anything.
    renderPage();
    fireEvent.change(search(), { target: { value: "   " } });
    expect(cardCount()).toBe(skills.length);
  });

  it("says on screen what is on screen", () => {
    // The count carries no visible copy, so the status region is the only place it is stated,
    // and the only place a disagreement with the grid can be caught.
    vi.useFakeTimers();
    try {
      renderPage();
      expect(settledCount()).toBe(
        `${skills.length} of ${skills.length} skills shown.`,
      );

      fireEvent.change(search(), { target: { value: "teach" } });
      expect(cardCount()).toBe(1);
      expect(settledCount()).toBe(`1 of ${skills.length} skills shown.`);
      expect(screen.queryByText("No skill matches those filters.")).toBeNull();
    } finally {
      // In a `finally` so a failed assertion above can't leak fake timers into later tests.
      vi.useRealTimers();
    }
  });

  it("still shows the empty state when a facet leaves nothing", () => {
    renderPage();
    pick("Plugin", "humanizer");
    pick("Agent", "Codex CLI");
    expect(
      skills.some(
        (skill) =>
          skill.plugin === "humanizer" && skill.agents.includes("Codex CLI"),
      ),
      "the combination this leans on now matches something",
    ).toBe(false);
    expect(screen.getByText("No skill matches those filters.")).toBeTruthy();
  });
});
