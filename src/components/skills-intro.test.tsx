/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  /**
   * The transcript is in the document before any timer runs, which is what a server-rendered
   * page and a client without JavaScript get. DX-100 was this bug in another component.
   */
  it("renders the whole transcript up front", () => {
    const { container } = render(<SkillsDemoTerminal />);
    // The painted copies only. `textContent` on the whole tree also picks up the aria-hidden
    // sizers, which carry the finished text whatever the animation is doing, so an assertion
    // against the tree stayed green even with `elapsed` seeded to 0.
    const painted = [...container.querySelectorAll("span.absolute")]
      .map((n) => n.textContent ?? "")
      .join(" ");
    expect(painted).toContain(
      "write the requirements doc for the client's booking portal",
    );
    expect(painted).toContain(
      "/brainstorm requirements doc for the booking portal",
    );
    const untyped = document.body.textContent ?? "";
    expect(untyped).toContain("HYPOTHESIS");
    expect(untyped).toContain("CONFIDENCE: ~40%");
    expect(untyped).toContain("GUESS");
  });

  /** One question, with its guess. Three batched questions is what `brainstorm` forbids. */
  it("asks a single question", () => {
    render(<SkillsDemoTerminal />);
    const text = document.body.textContent ?? "";
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
      ...container.querySelectorAll('[aria-hidden="true"].invisible'),
    ].map((n) => n.textContent?.trim());
    expect(sizers).toHaveLength(2);
    expect(sizers[0]).toContain(
      "write the requirements doc for the client's booking portal",
    );
    expect(sizers[1]).toContain(
      "/brainstorm requirements doc for the booking portal",
    );
  });

  it("offers a replay", () => {
    render(<SkillsDemoTerminal />);
    expect(screen.getByRole("button", { name: /Replay/ })).toBeDefined();
  });
});
