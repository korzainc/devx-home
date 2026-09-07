/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import GettingStartedPage from "./page";
import {
  faq,
  manualCommands,
  manualTools,
  walkthrough,
} from "@/lib/getting-started";

afterEach(cleanup);

describe("the Getting Started page", () => {
  it("leads with the one command, built from this origin", () => {
    const { container } = render(<GettingStartedPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(
      /one command/i,
    );
    expect(container.textContent).toMatch(
      /curl -fsSL https?:\/\/[^/]+\/setup \| sh/,
    );
  });

  it("does not claim a fixed duration or talk about a production release that doesn't exist", () => {
    const { container } = render(<GettingStartedPage />);
    expect(container.textContent).not.toMatch(/under 15 minutes/i);
    expect(container.textContent).not.toMatch(/production/i);
    expect(container.textContent).not.toMatch(/devx\.korza\.ai\/setup/);
  });

  it("offers a copy control for the install command", () => {
    render(<GettingStartedPage />);
    expect(
      screen.getByRole("button", { name: /copy install command/i }),
    ).toBeTruthy();
  });

  it("carries no em dashes or en dashes in its own copy", () => {
    const { container } = render(<GettingStartedPage />);
    expect(container.textContent).not.toMatch(/[–—]/);
  });

  it("covers every tool the CLI's catalogue installs, not just the first five", () => {
    // Regression: the manual path used to stop at git/gh/claude/homebrew and
    // silently omit SSH access, Python (uv), and Node (fnm), even though the
    // CLI catalogue has installed all three since before this page existed.
    render(<GettingStartedPage />);
    expect(screen.getAllByText(/ssh access/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/python \(uv\)/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/node \(fnm\)/i).length).toBeGreaterThan(0);
  });

  it("points questions about a broken step or missing tool at #devx", () => {
    render(<GettingStartedPage />);
    expect(screen.getAllByText(/#devx/).length).toBeGreaterThan(0);
  });

  it("does not carry Docker in the default manual flow", () => {
    render(<GettingStartedPage />);
    expect(manualTools.some((entry) => /docker/i.test(entry.tool))).toBe(false);
    expect(manualCommands.some((entry) => /docker/i.test(entry.title))).toBe(
      false,
    );
    expect(screen.queryByText(/docker/i)).toBeNull();
  });

  it("keeps the manual commands closed, so the page still leads with one command", () => {
    const { container } = render(<GettingStartedPage />);
    const disclosures = [...container.querySelectorAll("details")].filter(
      (node) => !node.closest("#questions"),
    );
    expect(disclosures).toHaveLength(manualCommands.length);
    for (const disclosure of disclosures) {
      expect(disclosure.open).toBe(false);
    }
  });

  it("keeps every question closed by default", () => {
    const { container } = render(<GettingStartedPage />);
    const disclosures = [...container.querySelectorAll("details")].filter(
      (node) => node.closest("#questions"),
    );
    expect(disclosures).toHaveLength(faq.length);
    for (const disclosure of disclosures) {
      expect(disclosure.open).toBe(false);
    }
  });

  it("carries every manual command, each in its own copyable field", () => {
    render(<GettingStartedPage />);
    const commands = manualCommands.flatMap((entry) => entry.commands);
    for (const command of commands) {
      expect(screen.getAllByText(command).length).toBeGreaterThan(0);
    }
    expect(
      screen.getAllByRole("button", { name: /copy terminal command/i }),
    ).toHaveLength(commands.length);
  });

  it("states what the installer does, in order", () => {
    render(<GettingStartedPage />);
    for (const step of walkthrough) {
      expect(screen.getByText(step.does)).toBeTruthy();
    }
  });

  it("answers every question, including what a failed step does", () => {
    render(<GettingStartedPage />);
    for (const entry of faq) {
      expect(screen.getByText(entry.q)).toBeTruthy();
    }
    expect(screen.getByText(/What happens if a step fails/)).toBeTruthy();
  });

  it("links the walkthrough to the manual steps and to the questions", () => {
    const { container } = render(<GettingStartedPage />);
    const targets = [...container.querySelectorAll('a[href^="#"]')].map(
      (node) => node.getAttribute("href"),
    );
    expect(targets).toContain("#manual");
    expect(targets).toContain("#questions");
    for (const target of new Set(targets)) {
      expect(
        container.querySelector(`[id="${target?.slice(1)}"]`),
      ).toBeTruthy();
    }
  });
});
