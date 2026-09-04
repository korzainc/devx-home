/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import GettingStartedPage from "./page";
import { faq, manualCommands, walkthrough } from "@/lib/getting-started";

afterEach(cleanup);

describe("the Getting Started page", () => {
  it("leads with the one command, and says the binary is not live yet", () => {
    render(<GettingStartedPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(
      /one command/i,
    );
    expect(screen.getByText(/devx\.korza\.ai\/setup/)).toBeTruthy();
    expect(screen.getByText("not live yet")).toBeTruthy();
  });

  it("keeps the manual commands closed, so the page still leads with one command", () => {
    const { container } = render(<GettingStartedPage />);
    const disclosures = container.querySelectorAll("details");
    expect(disclosures).toHaveLength(manualCommands.length);
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
