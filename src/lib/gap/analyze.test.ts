import { describe, expect, it } from "vitest";
import { analyze } from "./analyze";
import type { AnalysisTool, Baseline, RepoSnapshot } from "./types";

const baseline: Baseline = {
  categories: ["Security", "Testing", "Linting"],
  capabilities: {
    lint: { label: "Linting", category: "Linting" },
    "unit-tests": { label: "Unit tests", category: "Testing" },
    coverage: { label: "Coverage reporting", category: "Testing" },
    "secret-scanning": { label: "Secret scanning", category: "Security" },
    orphan: { label: "Orphan", category: "Nowhere" },
  },
  universal: ["secret-scanning"],
  stacks: [
    {
      id: "javascript",
      label: "JavaScript",
      markers: ["package.json"],
      expects: ["lint", "unit-tests", "coverage", "orphan"],
    },
    {
      id: "java",
      label: "Java",
      markers: ["pom.xml"],
      expects: ["lint"],
    },
  ],
};

const tools: AnalysisTool[] = [
  {
    id: "eslint",
    name: "ESLint",
    capabilities: ["lint"],
    stacks: ["javascript"],
    detect: { configFiles: ["eslint.config.mjs"] },
  },
  {
    id: "spotbugs",
    name: "SpotBugs",
    capabilities: ["lint"],
    stacks: ["java"],
    detect: { configFiles: ["spotbugs-exclude.xml"] },
  },
  {
    id: "gitleaks",
    name: "Gitleaks",
    capabilities: ["secret-scanning"],
    stacks: ["any"],
    detect: { configFiles: [".gitleaks.toml"] },
  },
  {
    id: "vitest",
    name: "Vitest",
    capabilities: ["unit-tests", "coverage"],
    stacks: ["javascript"],
    detect: { configFiles: ["vitest.config.ts"] },
  },
];

function snapshot(paths: string[]): RepoSnapshot {
  return {
    ref: { owner: "korzainc", repo: "example" },
    defaultBranch: "main",
    paths,
    files: {},
  };
}

function capability(
  report: ReturnType<typeof analyze>,
  id: string,
): { satisfied: boolean; present: string[]; recommended: string[] } {
  for (const category of report.categories) {
    for (const entry of category.capabilities) {
      if (entry.id === id) {
        return {
          satisfied: entry.satisfied,
          present: entry.present.map((tool) => tool.id),
          recommended: entry.recommended.map((tool) => tool.id),
        };
      }
    }
  }
  throw new Error(`${id} is not in the report`);
}

describe("analyze", () => {
  it("expects the universal capabilities even when no stack is recognised", () => {
    const report = analyze(snapshot(["README.md"]), { tools, baseline });

    expect(report.stacks).toEqual([]);
    expect(capability(report, "secret-scanning").satisfied).toBe(false);
    expect(report.gapCount).toBe(1);
  });

  it("marks a capability satisfied by the tool that covers it", () => {
    const report = analyze(snapshot(["package.json", "vitest.config.ts"]), {
      tools,
      baseline,
    });

    expect(capability(report, "unit-tests")).toMatchObject({
      satisfied: true,
      present: ["vitest"],
      recommended: [],
    });
    // One tool can close more than one gap.
    expect(capability(report, "coverage").satisfied).toBe(true);
  });

  it("recommends only tools that fit a detected stack", () => {
    const report = analyze(snapshot(["package.json"]), { tools, baseline });

    // SpotBugs also provides `lint`, but this repo is not a Java repo.
    expect(capability(report, "lint").recommended).toEqual(["eslint"]);
    // An `any` tool fits whatever was detected.
    expect(capability(report, "secret-scanning").recommended).toEqual([
      "gitleaks",
    ]);
  });

  it("recommends nothing when the catalogue has no tool for the capability", () => {
    const report = analyze(snapshot(["package.json"]), { tools, baseline });

    expect(capability(report, "orphan").recommended).toEqual([]);
  });

  it("orders categories by the baseline and puts unknown ones last", () => {
    const report = analyze(snapshot(["package.json"]), { tools, baseline });

    expect(report.categories.map((entry) => entry.category)).toEqual([
      "Security",
      "Testing",
      "Linting",
      "Nowhere",
    ]);
  });

  it("puts gaps before satisfied capabilities within a category", () => {
    const report = analyze(snapshot(["package.json", "vitest.config.ts"]), {
      tools,
      baseline,
    });

    const testing = report.categories.find(
      (entry) => entry.category === "Testing",
    );
    expect(testing?.capabilities.map((entry) => entry.satisfied)).toEqual([
      true,
      true,
    ]);

    const lint = report.categories.find(
      (entry) => entry.category === "Linting",
    );
    expect(lint?.capabilities[0].satisfied).toBe(false);
  });

  it("counts every expected capability exactly once", () => {
    const report = analyze(snapshot(["package.json", "eslint.config.mjs"]), {
      tools,
      baseline,
    });

    // lint, unit-tests, coverage, orphan, secret-scanning.
    expect(report.satisfiedCount + report.gapCount).toBe(5);
    expect(report.satisfiedCount).toBe(1);
  });

  it("reports the repo, branch and files it read", () => {
    const report = analyze(
      {
        ref: { owner: "korzainc", repo: "devx-home" },
        defaultBranch: "trunk",
        paths: ["package.json"],
        files: { "package.json": "{}", ".github/workflows/ci.yml": "" },
      },
      { tools, baseline },
    );

    expect(report.repo).toBe("korzainc/devx-home");
    expect(report.defaultBranch).toBe("trunk");
    expect(report.filesRead).toEqual([
      ".github/workflows/ci.yml",
      "package.json",
    ]);
  });
});
