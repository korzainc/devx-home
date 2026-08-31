import { describe, expect, it } from "vitest";
import { buildFixPrompt } from "./prompt";
import type { Analysis } from "./types";

const empty: Analysis = {
  repo: "korzainc/bare",
  defaultBranch: "main",
  stacks: [],
  filesRead: [],
  categories: [],
  satisfiedCount: 0,
  gapCount: 0,
};

function withGap(overrides: Partial<Analysis> = {}): Analysis {
  return {
    ...empty,
    filesRead: ["package.json"],
    stacks: [
      {
        id: "javascript",
        label: "JavaScript",
        markers: ["package.json"],
        expects: {},
      },
    ],
    categories: [
      {
        category: "Security",
        capabilities: [
          {
            id: "secret-scanning",
            label: "Secret scanning",
            satisfied: false,
            present: [],
            recommended: [{ id: "gitleaks", name: "Gitleaks" }],
          },
        ],
      },
    ],
    gapCount: 1,
    ...overrides,
  };
}

// A markdown table whose header is followed by nothing reads as a broken render rather than as an
// empty set, and the repo this feature exists for is exactly the one where nothing was detected.
function hasEmptyTable(prompt: string): boolean {
  return prompt
    .split("\n")
    .some(
      (line, index, lines) =>
        line.startsWith("| ---") && !(lines[index + 1] ?? "").startsWith("|"),
    );
}

describe("buildFixPrompt", () => {
  it("emits no table when the report found nothing at all", () => {
    const prompt = buildFixPrompt(empty);

    expect(hasEmptyTable(prompt)).toBe(false);
    expect(prompt).toContain(
      "Every check the baseline expects is already running",
    );
    expect(prompt).toContain("nothing here to avoid duplicating");
  });

  it("says so rather than listing nothing when no file was worth reading", () => {
    expect(buildFixPrompt(empty)).toContain(
      "It found no manifest and no CI config",
    );
    expect(buildFixPrompt(empty)).toContain(
      "no manifest was recognised at the repo root",
    );
  });

  it("numbers the gaps and names the tools the catalogue suggests", () => {
    const prompt = buildFixPrompt(withGap());

    expect(prompt).toContain("| 1 | Secret scanning | Security | Gitleaks |");
    expect(prompt).toContain("# Fix the CI pipeline in korzainc/bare");
    expect(hasEmptyTable(prompt)).toBe(false);
  });

  it("joins alternative tools with or, so none of them reads as also required", () => {
    const two = withGap();
    two.categories[0].capabilities[0].recommended = [
      { id: "kingfisher", name: "Kingfisher" },
      { id: "gitleaks", name: "Gitleaks" },
    ];
    expect(buildFixPrompt(two)).toContain("| Kingfisher or Gitleaks |");

    const three = withGap();
    three.categories[0].capabilities[0].recommended = [
      { id: "semgrep", name: "Semgrep" },
      { id: "codeql", name: "CodeQL" },
      { id: "trivy", name: "Trivy" },
    ];
    expect(buildFixPrompt(three)).toContain("| Semgrep, CodeQL or Trivy |");
  });

  it("says a gap has no tool rather than leaving the cell blank", () => {
    const analysis = withGap();
    analysis.categories[0].capabilities[0].recommended = [];

    expect(buildFixPrompt(analysis)).toContain(
      "no tool in the catalogue for this stack",
    );
  });

  it("keeps a repo path from breaking out of the cell it sits in", () => {
    const analysis = withGap({
      satisfiedCount: 1,
      categories: [
        {
          category: "Testing",
          capabilities: [
            {
              id: "unit-tests",
              label: "Unit tests",
              satisfied: true,
              present: [
                {
                  id: "vitest",
                  name: "Vitest",
                  evidence: "runs vitest in a|b/`c`.json",
                },
              ],
              recommended: [],
            },
          ],
        },
      ],
      gapCount: 0,
    });

    const row = buildFixPrompt(analysis)
      .split("\n")
      .find((line) => line.includes("Vitest"));

    expect(row).toBe(
      "| Unit tests | Vitest | `runs vitest in a\\|b/'c'.json` |",
    );
  });
});
