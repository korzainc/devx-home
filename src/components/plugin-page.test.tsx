/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallPanel } from "@/components/install-panel";
import { PluginSkills } from "@/components/plugin-skills";
import { getPlugin, installCommands, skillsForPlugin } from "@/lib/catalogue";

/**
 * Both failures here are silent: the panel showing a command for the wrong runtime, and skills
 * that no control can reach. Neither looks broken on screen.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const codezen = getPlugin("codezen")!;
// Claude Code only, which is what makes the single-agent case real rather than hypothetical.
const mattpocock = getPlugin("mattpocock-skills")!;

describe("the install panel", () => {
  it("shows the command for the agent that is selected", () => {
    render(<InstallPanel commands={installCommands(codezen)} />);
    const [claude, codex] = installCommands(codezen);
    expect(claude.agent).toBe("Claude Code");

    expect(screen.getByText(claude.install)).toBeTruthy();
    expect(screen.queryByText(codex.install)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: codex.agent }));
    expect(screen.getByText(codex.install)).toBeTruthy();
    expect(screen.queryByText(claude.install)).toBeNull();
  });

  it("shows the register command alongside, and switches it too", () => {
    // Register and install are different commands per agent; showing one agent's install beside
    // another's register would be copied without anyone noticing.
    render(<InstallPanel commands={installCommands(codezen)} />);
    const [claude, codex] = installCommands(codezen);

    expect(screen.getByText(claude.register)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: codex.agent }));
    expect(screen.getByText(codex.register)).toBeTruthy();
    expect(screen.queryByText(claude.register)).toBeNull();
  });

  it("copies the command it displays", async () => {
    // The panel's primary action; writing the label instead of the value was invisible.
    const written: string[] = [];
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: async (v: string) => void written.push(v) },
    });
    render(<InstallPanel commands={installCommands(codezen)} />);
    const [claude] = installCommands(codezen);

    fireEvent.click(screen.getByRole("button", { name: /^Copy install/ }));
    await waitFor(() => expect(written).toHaveLength(1));
    // Not waitFor: that passes on a momentarily-correct value and ignores a trailing write.
    expect(written).toEqual([claude.install]);
  });

  it("offers no control for an agent the plugin does not ship for", () => {
    expect(mattpocock.agents).toEqual(["Claude Code"]);
    render(<InstallPanel commands={installCommands(mattpocock)} />);

    expect(screen.getByRole("button", { name: "Claude Code" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Codex CLI" })).toBeNull();
    expect(screen.queryByText(/^codex plugin add/)).toBeNull();
  });
});

describe("the skills in a plugin", () => {
  const skills = skillsForPlugin("codezen");

  it("shows a preview, then every skill once expanded", () => {
    // The heading states the full count, so a broken control leaves the page contradicting
    // itself rather than looking empty.
    expect(skills.length).toBeGreaterThan(5);
    render(<PluginSkills skills={skills} />);

    const shown = () =>
      skills.filter((skill) => screen.queryByText(skill.name)).length;
    expect(shown()).toBe(5);

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(`^Show all ${skills.length} skills`),
      }),
    );
    expect(shown()).toBe(skills.length);
  });

  it("does not offer to expand when everything is already shown", () => {
    render(<PluginSkills skills={skills.slice(0, 3)} />);
    expect(screen.queryByRole("button", { name: /^Show all/ })).toBeNull();
  });
});
