/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { SkillsDemoTerminal } from "@/components/skills-demo-terminal";
import { InstallPanel } from "@/components/install-panel";
import {
  GettingStartedNote,
  InstallPrerequisite,
} from "@/components/skills-install-notes";
import {
  SkillsGlossaryNote,
  SkillsIntroPanes,
} from "@/components/skills-intro-panes";
import { getPlugin, installCommands, marketplaceRepo } from "@/lib/catalogue";

/**
 * The onboarding surfaces. Each assertion goes through the rendered DOM: the suite this repo
 * replaced re-implemented its component, and a mutation audit then passed 13 changes unnoticed.
 */

afterEach(cleanup);

describe("the three panes", () => {
  it("says a skill usually fires without being typed", () => {
    render(<SkillsIntroPanes />);
    // The correction the whole design turns on. If this pane goes, so does the point.
    expect(
      screen.getByRole("heading", { name: "Usually without being asked" }),
    ).toBeDefined();
  });

  it("offers the demo and the catalogue as the two ways on", () => {
    render(<SkillsIntroPanes />);
    const hrefs = screen
      .getAllByRole("link")
      .map((node) => node.getAttribute("href"));
    expect(hrefs).toContain("/skills-intro/demo");
    expect(hrefs).toContain("/skills");
  });

  /** The order is the argument: what it is, then that it self-loads, then how to get it. */
  it("walks what, how it fires, then how to get one", () => {
    render(<SkillsIntroPanes />);
    const eyebrows = screen
      .getAllByRole("article")
      .map((pane) => pane.firstElementChild?.textContent?.trim());
    expect(eyebrows).toEqual(["What it is", "How it fires", "How to get one"]);
  });
});

describe("the glossary note", () => {
  it("names the three words in containment order", () => {
    // The whole note, not one term: each word sits in its own span, so matching by text
    // returns the innermost element and the other two words are not in it.
    const { container } = render(<SkillsGlossaryNote />);
    const text = container.textContent ?? "";
    expect(text.indexOf("marketplace")).toBeLessThan(text.indexOf("plugin"));
    expect(text.indexOf("plugin")).toBeLessThan(text.indexOf("skill"));
  });
});

describe("the install panel", () => {
  function tabsFor(id: string) {
    const plugin = getPlugin(id);
    if (!plugin) throw new Error(`${id} is not in the catalogue`);
    return installCommands(plugin).map((entry) => ({
      id: entry.agent,
      label: entry.agent,
      blocks: [
        {
          label: "Register once per machine",
          content: entry.register,
          name: "r",
        },
        { label: "Install", content: entry.install, name: "i" },
      ],
    }));
  }

  /** One agent selectable at a time, the same control the detail pages offer. */
  it("offers every agent the plugin claims as a choice", () => {
    const tabs = tabsFor("codezen");
    render(<InstallPanel tabs={tabs} />);
    expect(tabs.length).toBeGreaterThan(1);
    for (const tab of tabs) {
      expect(screen.getByRole("button", { name: tab.label })).toBeDefined();
    }
    const pressed = screen.getAllByRole("button", { pressed: true });
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toBe(tabs[0].label);
  });

  it("swaps the commands when another agent is picked", () => {
    const tabs = tabsFor("codezen");
    render(<InstallPanel tabs={tabs} />);
    fireEvent.click(screen.getByRole("button", { name: tabs[1].label }));
    const shown = screen.getAllByRole("code").map((n) => n.textContent);
    expect(shown).toContain(tabs[1].blocks[0].content);
    expect(shown).toContain(tabs[1].blocks[1].content);
  });

  /** Commands come from the catalogue, so a hardcoded string here would drift from the pages. */
  it("prints the commands the catalogue holds, not its own", () => {
    const tabs = tabsFor("codezen");
    render(<InstallPanel tabs={tabs} />);
    const shown = screen.getAllByRole("code").map((n) => n.textContent);
    expect(shown).toContain(tabs[0].blocks[0].content);
    expect(shown.join(" ")).toContain(marketplaceRepo);
  });

  /**
   * The notes are rendered, not passed as literals. Asserting a sentence handed to `intro` only
   * proved the prop worked; deleting the prerequisite from the page left that green.
   */
  it("states that an agent has to be installed already", () => {
    render(<InstallPrerequisite />);
    expect(screen.getByText(/has to be on your machine already/)).toBeDefined();
  });

  it("does not promise a guide it cannot reach yet", () => {
    render(<GettingStartedNote />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/");
    // The label has to match where it goes until /getting-started exists.
    expect(link.textContent).not.toMatch(/guide/i);
  });

  it("omits the footer when none is given", () => {
    render(<InstallPanel tabs={tabsFor("codezen")} />);
    expect(screen.queryByText(/has to be on your machine already/)).toBeNull();
  });
});

describe("the demo terminal", () => {
  /** The painted rows of the animated copy. */
  function painted(container: HTMLElement) {
    return [...container.querySelectorAll(".demo-live span.absolute")]
      .map((node) => node.textContent ?? "")
      .join(" ");
  }

  // The replay used to begin at its end and rewind, wiping text the reader was reading.
  it("starts the animated copy empty, so nothing is wiped", () => {
    const { container } = render(<SkillsDemoTerminal />);
    expect(painted(container)).not.toContain(
      "write the requirements doc for the client's booking portal",
    );
    // Untyped rows keep their text from the first frame to reserve the row height, so
    // opacity is what hides them.
    const rows = [
      ...container.querySelectorAll<HTMLElement>(".demo-live span.block"),
    ];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.style.opacity === "0")).toBe(true);
  });

  // Which puts the burden on the fallbacks: DX-100 was this bug in another component.
  it("carries the whole transcript for a reader without JavaScript", () => {
    // React fills `noscript` on the server and empties it in the browser, so only the
    // served markup shows what this reader gets.
    const html = renderToString(<SkillsDemoTerminal />);
    const fallback = html.slice(html.indexOf("<noscript>"));
    expect(fallback).toContain(
      "write the requirements doc for the client&#x27;s booking portal",
    );
    expect(fallback).toContain("HYPOTHESIS");
    // And it takes the other two copies off the page.
    expect(fallback).toContain("display:none");
  });

  /** A replay that never runs must not leave an empty box. */
  it("carries it for a reader who asked for less motion", () => {
    const { container } = render(<SkillsDemoTerminal />);
    const reduced = container.querySelector(".demo-reduced")?.textContent ?? "";
    expect(reduced).toContain(
      "write the requirements doc for the client's booking portal",
    );
    expect(reduced).toContain("CONFIDENCE: ~40%");
  });

  /** The three copies never show together. */
  it("shows one transcript at a time", () => {
    const { container } = render(<SkillsDemoTerminal />);
    // `classList`, not the string: `overflow-hidden` contains "hidden", so a substring
    // check passed with the static copy set to plain `block`.
    const reduced = container.querySelector(".demo-reduced")!.classList;
    expect(reduced.contains("hidden")).toBe(true);
    expect(reduced.contains("motion-reduce:block")).toBe(true);
    expect(reduced.contains("block")).toBe(false);
    expect(
      container
        .querySelector(".demo-live")!
        .classList.contains("motion-reduce:hidden"),
    ).toBe(true);
  });

  /** One question, with its guess. Three batched questions is what `brainstorm` forbids. */
  it("asks a single question", () => {
    const { container } = render(<SkillsDemoTerminal />);
    const text = container.querySelector(".demo-reduced")?.textContent ?? "";
    expect(text.match(/Q:/g)).toHaveLength(1);
    expect(text.match(/GUESS:/g)).toHaveLength(1);
  });

  /**
   * jsdom has no layout, so the growth itself is not observable here. What is testable is the
   * mechanism: a typed row carries a hidden copy of its finished text, which is what holds the
   * row's height while only part of it has been typed.
   */
  it("sizes each typed row by its finished text", () => {
    const { container } = render(<SkillsDemoTerminal />);
    const sizers = [
      ...container.querySelectorAll(
        '.demo-live [aria-hidden="true"].invisible',
      ),
    ].map((n) => n.textContent?.trim());
    expect(sizers).toHaveLength(2);
    expect(sizers[0]).toContain(
      "write the requirements doc for the client's booking portal",
    );
    expect(sizers[1]).toContain(
      "/brainstorm requirements doc for the booking portal",
    );
  });

  /** Asking for less motion should not cost the reader the control. */
  it("offers a replay on either copy", () => {
    render(<SkillsDemoTerminal />);
    expect(screen.getAllByRole("button", { name: /Replay/ })).toHaveLength(2);
  });

  // Pressing it hides the button pressed, dropping focus to the body -- seen in Chrome.
  it("keeps focus with the reader when the copies swap", () => {
    const { container } = render(<SkillsDemoTerminal />);
    const [live, reduced] = screen.getAllByRole("button", { name: /Replay/ });
    reduced.focus();
    fireEvent.click(reduced);
    expect(document.activeElement).toBe(live);
    expect(
      container.querySelector(".demo-reduced")!.classList.contains("hidden"),
    ).toBe(true);
  });

  /** An explicit request, so the animated copy takes over. */
  it("shows the replay once it has been asked for", () => {
    const { container } = render(<SkillsDemoTerminal />);
    fireEvent.click(screen.getAllByRole("button", { name: /Replay/ })[1]);
    expect(
      container
        .querySelector(".demo-live")!
        .classList.contains("motion-reduce:hidden"),
    ).toBe(false);
    expect(
      container
        .querySelector(".demo-reduced")!
        .classList.contains("motion-reduce:block"),
    ).toBe(false);
  });
});
