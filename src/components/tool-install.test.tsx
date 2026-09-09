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
import { ToolInstall } from "@/components/tool-install";
import { toolInstallMethods } from "@/lib/catalogue";

function renderTool(id: string) {
  return render(<ToolInstall methods={toolInstallMethods(id)} />);
}

describe("the install panel on a tool page", () => {
  // vitest.config.mts sets globals: false, so RTL's own auto-cleanup never registers.
  afterEach(cleanup);

  it("renders nothing at all when there is nothing to install", () => {
    // Not an empty panel: go-test's check ships with the Go toolchain.
    const { container } = renderTool("go-test");
    expect(container.innerHTML).toBe("");
  });

  it("shows one method at a time and switches on the tab", () => {
    renderTool("trivy");
    expect(screen.getByText("brew install trivy")).toBeTruthy();
    expect(screen.queryByText(/^docker pull aquasec/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Docker" }));
    expect(screen.getByText("docker pull aquasec/trivy:0.52.0")).toBeTruthy();
    expect(screen.queryByText("brew install trivy")).toBeNull();
  });

  it("distinguishes Korza's image from any other Docker tab", () => {
    // Both are docker pulls. Two tabs reading "Docker" would be a coin flip for the reader.
    renderTool("trivy");
    const labels = screen
      .getAllByRole("button")
      .map((node) => node.textContent)
      .filter((label) => label !== "");
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toContain("Korza CI image");
  });

  it("names a lone method without offering a tab that switches nothing", () => {
    renderTool("biome");
    expect(screen.getByText("npm")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "npm" })).toBeNull();
  });

  it("says which file a snippet goes in, and gives one that a pom accepts", () => {
    // A bare <plugin> block at the root of a pom is invalid, and the command alone never said
    // it was meant for a pom in the first place.
    renderTool("jacoco");
    expect(screen.getByText("pom.xml")).toBeTruthy();
    const snippet = screen.getByText(/jacoco-maven-plugin/).textContent ?? "";
    expect(snippet).toContain("<build>");
    expect(snippet).toContain("<plugins>");
  });

  it("lists what a GitHub Action step takes, and what it needs before it", () => {
    renderTool("codeql");
    expect(screen.getByText(".github/workflows/ci.yml")).toBeTruthy();
    expect(screen.getByText("category")).toBeTruthy();
    expect(screen.getAllByText(/Defaults to/).length).toBeGreaterThan(0);
    // A bare analyze step does nothing without init earlier in the job, which the catalogue's
    // one-line entry hid completely.
    expect(screen.getByText(/codeql-action\/init/)).toBeTruthy();
  });

  it("keeps an action's inputs out of an unrelated method's tab", () => {
    // codeql has one method today, so build the two-method case rather than wait for one.
    render(
      <ToolInstall
        methods={[
          {
            id: "brew-x",
            label: "Homebrew",
            kind: "shell",
            command: "brew install x",
          },
          {
            id: "action-x",
            label: "GitHub Actions",
            kind: "snippet",
            command: "- uses: github/codeql-action/analyze@v4",
            target: ".github/workflows/ci.yml",
            action: "github/codeql-action/analyze",
          },
        ]}
      />,
    );
    expect(screen.queryByText("Inputs")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "GitHub Actions" }));
    expect(screen.getByText("Inputs")).toBeTruthy();
  });

  it("degrades to the uses line for an action nothing documents", () => {
    render(
      <ToolInstall
        methods={[
          {
            id: "action-y",
            label: "GitHub Actions",
            kind: "snippet",
            command: "- uses: someone/brand-new-action@v1",
            target: ".github/workflows/ci.yml",
            action: "someone/brand-new-action",
          },
        ]}
      />,
    );
    expect(
      screen.getByText("- uses: someone/brand-new-action@v1"),
    ).toBeTruthy();
    expect(screen.queryByText("Inputs")).toBeNull();
  });

  it("copies the payload of the tab that is showing, not the one that was", async () => {
    const written: string[] = [];
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText: async (v: string) => void written.push(v) },
    });
    renderTool("trivy");

    fireEvent.click(screen.getByRole("button", { name: "Korza CI image" }));
    fireEvent.click(screen.getByRole("button", { name: /^Copy/ }));
    await waitFor(() => expect(written).toHaveLength(1));
    // Not waitFor on the value: that passes on a momentarily-correct read.
    expect(written).toEqual([
      "docker pull korzacitools.azurecr.io/ci-common:0.1.0",
    ]);
  });
});
