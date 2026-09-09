/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import GettingStartedPage from "./page";
import { bootstrapCommand } from "@/lib/bootstrap-command";
import { faq, manualCommands } from "@/lib/getting-started";

beforeEach(() => vi.stubEnv("KORZA_PUBLIC_ORIGIN", "https://setup.example"));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("the Getting Started page", () => {
  it("includes the configured install command in server HTML", () => {
    const container = document.createElement("div");
    container.innerHTML = renderToString(<GettingStartedPage />);
    expect(container.querySelector("code")?.textContent).toBe(
      bootstrapCommand("https://setup.example/setup"),
    );
    expect(container.textContent).not.toContain("Loading install command");
  });

  it("keeps manual setup available when the origin is invalid", () => {
    vi.stubEnv("KORZA_PUBLIC_ORIGIN", "http://untrusted.example");
    render(<GettingStartedPage />);
    expect(screen.getByText(/Installer unavailable/)).toBeDefined();
    expect(
      screen.getAllByRole("button", { name: /copy terminal command/i }).length,
    ).toBeGreaterThan(0);
  });
  it("leads with the one command, built from the configured origin", () => {
    const { container } = render(<GettingStartedPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(
      /one command/i,
    );
    expect(container.textContent).toContain(
      bootstrapCommand("https://setup.example/setup"),
    );
  });

  it("directs first-time users to the setup command printed by the installer", () => {
    render(<GettingStartedPage />);
    const hero = screen.getByRole("heading", { level: 1 }).closest("section");
    expect(hero?.textContent).toMatch(
      /run the exact setup command printed by the installer/i,
    );
  });

  it("points questions about a broken step or missing tool at #devx", () => {
    render(<GettingStartedPage />);
    const support = screen
      .getByText(/Something is broken, or the CLI/)
      .closest("details");
    expect(support?.querySelector("p")?.textContent).toContain("#devx");
  });

  it("does not carry Docker in the default manual flow", () => {
    render(<GettingStartedPage />);
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

  it("renders each tool with its own manual commands", () => {
    const { container } = render(<GettingStartedPage />);
    const disclosures = [...container.querySelectorAll("#manual details")];
    const expected = [
      ["Xcode tools", "xcode-select --install"],
      ["git", 'git config --global user.name "Your Name"'],
      ["gh", "gh auth login --hostname github.com --git-protocol https --web"],
      ["SSH access", "ssh -T git@github.com"],
      ["claude", "claude plugin marketplace add korzainc/marketplace"],
      [
        "homebrew",
        "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh",
      ],
      ["Python (uv)", "uv python install"],
      [
        "Node (fnm)",
        "curl -fsSL https://fnm.vercel.app/install | bash -s -- --force-install",
      ],
    ];
    expect(disclosures).toHaveLength(expected.length);
    for (const [index, [label, command]] of expected.entries()) {
      const disclosure = disclosures[index];
      expect(disclosure.querySelector("summary")?.textContent).toContain(label);
      const commands = [...disclosure.querySelectorAll("code")];
      expect(
        commands.some((field) => field.textContent?.includes(command)),
      ).toBe(true);
    }
  });

  it("authorizes the SSH upload and loads the key before checking access", () => {
    const { container } = render(<GettingStartedPage />);
    const ssh = [...container.querySelectorAll("#manual details")].find(
      (node) =>
        node.querySelector("summary")?.textContent?.includes("SSH access"),
    );
    expect(ssh).toBeDefined();
    expect(
      ssh!
        .querySelector("p")!
        .compareDocumentPosition(ssh!.querySelector("code")!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const commands = [...ssh!.querySelectorAll("code")].map(
      (field) => field.textContent,
    );
    const permissionIndex = commands.indexOf(
      "gh auth refresh --hostname github.com --scopes write:public_key",
    );
    const uploadIndex = commands.findIndex((command) =>
      command?.startsWith("gh ssh-key add "),
    );
    expect(permissionIndex).toBeGreaterThanOrEqual(0);
    expect(uploadIndex).toBeGreaterThan(permissionIndex);
    const loadIndex = commands.indexOf("ssh-add ~/.ssh/id_ed25519");
    expect(loadIndex).toBeGreaterThan(uploadIndex);
    expect(commands.indexOf("ssh -T git@github.com")).toBeGreaterThan(
      loadIndex,
    );
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
