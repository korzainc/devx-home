/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";
import { AUDIENCES, AUDIENCE_ANY } from "@/data/skill-audiences";
import { getUpdates } from "@/lib/updates";

/**
 * The home page names twelve skills by id and hand-orders them so that every audience chip can
 * fill the grid. Both halves of that are invisible from the markup and both break on a marketplace
 * sync rather than on an edit here, which is what these are for.
 *
 * Importing the module at all is already a test: `featuredSkills` throws at module scope if the
 * marketplace stops publishing one of the ids.
 */

// The panels snap and the strokes are drawn by an observer. jsdom has neither the observer nor
// `matchMedia`, and neither is what this file is about; both have tests of their own.
beforeAll(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
});

afterEach(cleanup);

const CELLS = 6;

/**
 * Scoped by `.deal`, the class the skill cards carry, because the closing panel's doors are `h3`
 * too and a bare heading query counts those as skills.
 */
function cards(container: HTMLElement) {
  return [...container.querySelectorAll(".deal h3")];
}

describe("the home page", () => {
  it("fills the grid for every audience", () => {
    const { container } = render(<Home />);

    // `AUDIENCES` rather than a written-out list, so adding a fourth audience to the overlay
    // fails here until the featured pool has enough skills to serve it.
    for (const audience of AUDIENCES) {
      if (audience === AUDIENCE_ANY) continue;
      fireEvent.click(screen.getByRole("button", { name: audience }));
      expect(
        cards(container).length,
        `the ${audience} chip cannot fill the grid`,
      ).toBe(CELLS - 1);
    }
  });

  it("opens on a spread of audiences rather than five of one", () => {
    const { container } = render(<Home />);

    // The unfiltered view is the first thing a reader sees, and five Engineering rows would sell
    // the marketplace as an engineering tool. The pool is ordered to prevent that.
    const eyebrows = cards(container).map(
      (heading) => heading.previousElementSibling?.textContent ?? "",
    );
    expect(new Set(eyebrows).size).toBeGreaterThan(1);
  });

  it("nests the headings", () => {
    const { container } = render(<Home />);

    // The page is read as an outline by anyone who navigates by heading, and the panels are long
    // enough that the outline is the only way through it. The argument panel used to state its
    // claim in a paragraph, which promoted its four reasons to siblings of the panels themselves.
    const levels = [...container.querySelectorAll("h1, h2, h3, h4")].map((h) =>
      Number(h.tagName[1]),
    );
    expect(levels.filter((level) => level === 1).length).toBe(1);
    expect(levels[0]).toBe(1);
    for (const [i, level] of levels.entries()) {
      if (i === 0) continue;
      expect(level, `heading ${i} jumps past a level`).toBeLessThanOrEqual(
        levels[i - 1]! + 1,
      );
    }
  });

  it("reads the example report's labels from the catalogue", () => {
    render(<Home />);

    // Written here instead, the preview could name a check differently from the analysis that
    // runs it. `capabilityLabel` throws on an id the catalogue has retired.
    expect(
      screen.getAllByText("Dependency Vulnerabilities").length,
    ).toBeGreaterThan(0);
  });

  it("names a repository that cannot exist", () => {
    render(<Home />);

    // Nothing on screen says the run is illustrative any more, so a real name here would read as
    // a published audit of somebody's project.
    expect(screen.getAllByText("korza/kessel-run").length).toBeGreaterThan(0);
  });

  it("shows the three newest updates, newest first", () => {
    render(<Home />);

    const newest = getUpdates().slice(0, 3);
    expect(newest.length).toBe(3);
    for (const entry of newest) {
      expect(screen.getAllByText(entry.title).length).toBeGreaterThan(0);
    }
  });

  it("points the Slack door at a channel that survives a rename", () => {
    render(<Home />);

    // By id, not by name. A `?channel=devx` style link breaks the day somebody renames it.
    const slack = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"))
      .find((href) => href?.includes("slack.com"));
    expect(slack).toMatch(/\/archives\/[A-Z0-9]+$/);
  });

  it("submits the repository field without javascript", () => {
    const { container } = render(<Home />);

    // A GET form to the report page, which reads `repo` off the query string. A handler here
    // would leave the field dead until the bundle arrived.
    const form = container.querySelector("form")!;
    expect(form.getAttribute("action")).toBe("/ci-coverage");
    expect(form.getAttribute("method")).not.toBe("post");
    expect(
      screen.getByLabelText("Repository to analyze").getAttribute("name"),
    ).toBe("repo");
  });
});
