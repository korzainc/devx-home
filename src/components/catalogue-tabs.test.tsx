/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CatalogueTabs } from "@/components/catalogue-tabs";
import { browsableSkills, plugins, toolchainSkills } from "@/lib/catalogue";

/**
 * The header block above the tabs. The panels have their own suites; this one covers what the
 * heading area promises: the two definitions stay put across a tab change, and the tab controls
 * keep working. Everything is asserted through the DOM the component actually renders -- the
 * suite this repo replaced re-implemented its component and missed 13 mutations doing so.
 */

afterEach(cleanup);

function renderTabs() {
  render(
    <CatalogueTabs
      plugins={plugins}
      skills={browsableSkills}
      toolchain={toolchainSkills}
    />,
  );
}

/**
 * The glossary line, read as its leaf spans. Spacing between term and gloss is CSS `gap`, so
 * `textContent` flattens to "pluginwhat you install" and an assertion written against the
 * rendered look never matches.
 */
function glossary() {
  return [...document.querySelectorAll("p.flex-wrap > span > span")]
    .map((node) => node.textContent?.trim())
    .filter(Boolean)
    .join(" ");
}

function tab(name: "Plugins" | "Skills") {
  return screen.getByRole("tab", { name: new RegExp(`^${name}`) });
}

describe("the glossary line above the tabs", () => {
  it("names a plugin as the thing you install", () => {
    renderTabs();
    expect(glossary()).toContain("plugin what you install");
  });

  it("names a skill as the thing that does the work", () => {
    renderTabs();
    expect(glossary()).toContain("skill what does the work");
  });

  /** Containment reads left to right, which is the only thing the ⊃ is there to say. */
  it("puts the plugin before the skill it contains", () => {
    renderTabs();
    const text = glossary();
    expect(text.indexOf("plugin")).toBeLessThan(text.indexOf("skill"));
    expect(text).toContain("⊃");
  });

  /** The catalogue drops `marketplace`: nothing on this page asks the reader about one. */
  it("leaves the marketplace out", () => {
    renderTabs();
    expect(glossary()).not.toContain("marketplace");
  });

  it("offers the introduction beside them", () => {
    renderTabs();
    const link = screen.getByRole("link", { name: /Introduction to skills/ });
    expect(link.getAttribute("href")).toBe("/skills-intro");
  });

  /** The reason they are static: switching tabs used to swap this copy and move the grid. */
  it("does not change when the tab changes", () => {
    renderTabs();
    const before = glossary();
    fireEvent.click(tab("Skills"));
    expect(tab("Skills").getAttribute("aria-selected")).toBe("true");
    expect(glossary()).toEqual(before);
  });
});

describe("the tabs themselves", () => {
  it("opens on Plugins, because a plugin is what you install", () => {
    renderTabs();
    expect(tab("Plugins").getAttribute("aria-selected")).toBe("true");
    expect(tab("Skills").getAttribute("aria-selected")).toBe("false");
  });

  it("counts every skill row in the Skills tab, toolchain rows included", () => {
    renderTabs();
    const total = browsableSkills.length + toolchainSkills.length;
    expect(tab("Skills").textContent).toContain(String(total));
    expect(tab("Plugins").textContent).toContain(String(plugins.length));
  });

  it("shows one panel at a time", () => {
    renderTabs();
    const pluginsPanel = document.getElementById("catalogue-panel-plugins");
    const skillsPanel = document.getElementById("catalogue-panel-skills");
    expect(pluginsPanel?.hasAttribute("hidden")).toBe(false);
    expect(skillsPanel?.hasAttribute("hidden")).toBe(true);

    fireEvent.click(tab("Skills"));
    expect(pluginsPanel?.hasAttribute("hidden")).toBe(true);
    expect(skillsPanel?.hasAttribute("hidden")).toBe(false);
  });
});
