import { describe, expect, it } from "vitest";
import { detectStacks, detectTools, filesToRead } from "./detect";
import type { AnalysisTool, Baseline, RepoSnapshot } from "./types";

// A fixture rather than the real catalogue: these cover the engine, and should not have to change
// every time a tool or a baseline expectation is edited.
const baseline: Baseline = {
  categories: ["Security", "Testing"],
  capabilities: {
    lint: { label: "Linting", category: "Linting" },
    "unit-tests": { label: "Unit tests", category: "Testing" },
    "workflow-lint": { label: "Workflow linting", category: "CI Meta" },
  },
  universal: [],
  stacks: [
    {
      id: "javascript",
      label: "JavaScript",
      markers: ["package.json"],
      expects: ["lint"],
    },
    { id: "go", label: "Go", markers: ["go.mod"], expects: ["unit-tests"] },
    {
      id: "github-actions",
      label: "GitHub Actions",
      markers: [".github/workflows"],
      expects: ["workflow-lint"],
    },
  ],
};

function snapshot(partial: Partial<RepoSnapshot> = {}): RepoSnapshot {
  return {
    ref: { owner: "korzainc", repo: "example" },
    defaultBranch: "main",
    paths: [],
    files: {},
    ...partial,
  };
}

function tool(
  id: string,
  detect: AnalysisTool["detect"],
  capabilities = ["lint"],
): AnalysisTool {
  return { id, name: id, capabilities, stacks: ["any"], detect };
}

describe("detectStacks", () => {
  it("matches a root manifest", () => {
    const stacks = detectStacks(["package.json", "src/index.ts"], baseline);
    expect(stacks.map((stack) => stack.id)).toEqual(["javascript"]);
  });

  it("matches a directory marker through its contents", () => {
    const stacks = detectStacks([".github/workflows/ci.yml"], baseline);
    expect(stacks.map((stack) => stack.id)).toEqual(["github-actions"]);
  });

  it("ignores a manifest that is not at the root", () => {
    expect(detectStacks(["packages/web/package.json"], baseline)).toEqual([]);
  });

  it("returns every stack present, not just the first", () => {
    const stacks = detectStacks(["package.json", "go.mod"], baseline);
    expect(stacks.map((stack) => stack.id)).toEqual(["javascript", "go"]);
  });
});

describe("filesToRead", () => {
  it("takes root manifests and CI config, and nothing else", () => {
    const paths = [
      "package.json",
      "packages/web/package.json",
      "src/index.ts",
      "README.md",
      ".gitlab-ci.yml",
      ".github/workflows/ci.yml",
    ];

    expect(filesToRead(paths, baseline)).toEqual([
      "package.json",
      ".gitlab-ci.yml",
      ".github/workflows/ci.yml",
    ]);
  });

  it("reads workflows before composite actions", () => {
    // Alphabetically `.github/actions` sorts first, so order here has to be deliberate: a repo
    // that overruns the cap needs its workflows more than its composite actions.
    const paths = [
      ".github/actions/setup/action.yml",
      ".github/workflows/ci.yml",
    ];

    expect(filesToRead(paths, baseline)).toEqual([
      ".github/workflows/ci.yml",
      ".github/actions/setup/action.yml",
    ]);
  });

  it("caps the number of reads", () => {
    const paths = Array.from(
      { length: 40 },
      (_, index) => `.github/workflows/job-${index}.yml`,
    );

    expect(filesToRead(paths, baseline)).toHaveLength(20);
  });
});

describe("detectTools", () => {
  it("matches an action reference regardless of the pinned ref", () => {
    const found = detectTools(
      snapshot({
        paths: [".github/workflows/ci.yml"],
        files: {
          ".github/workflows/ci.yml":
            "jobs:\n  scan:\n    steps:\n      - uses: aquasecurity/trivy-action@ed142fd\n",
        },
      }),
      [tool("trivy", { ciUses: ["aquasecurity/trivy-action"] })],
    );

    expect(found).toEqual([
      {
        id: "trivy",
        name: "trivy",
        evidence: "uses: aquasecurity/trivy-action",
      },
    ]);
  });

  it("matches a command in a workflow step and names the file", () => {
    const found = detectTools(
      snapshot({
        paths: [".github/workflows/ci.yml"],
        files: {
          ".github/workflows/ci.yml":
            "jobs:\n  test:\n    steps:\n      - run: go test ./...\n",
        },
      }),
      [tool("go-test", { commands: ["go test"] })],
    );

    expect(found[0].evidence).toBe("runs go test in .github/workflows/ci.yml");
  });

  it("treats a package script as a command, since CI runs it indirectly", () => {
    const found = detectTools(
      snapshot({
        paths: ["package.json"],
        files: {
          "package.json": JSON.stringify({ scripts: { lint: "eslint" } }),
        },
      }),
      [tool("eslint", { commands: ["eslint"] })],
    );

    expect(found[0].evidence).toBe("runs eslint in package.json");
  });

  it("does not read a package script as a declared dependency", () => {
    const found = detectTools(
      snapshot({
        paths: ["package.json"],
        files: {
          "package.json": JSON.stringify({ scripts: { lint: "eslint" } }),
        },
      }),
      [tool("eslint", { manifestDeps: ["eslint"] })],
    );

    expect(found).toEqual([]);
  });

  it("matches a declared dependency", () => {
    const found = detectTools(
      snapshot({
        paths: ["package.json"],
        files: {
          "package.json": JSON.stringify({ devDependencies: { vitest: "^4" } }),
        },
      }),
      [tool("vitest", { manifestDeps: ["vitest"] })],
    );

    expect(found[0].evidence).toBe("vitest in package.json");
  });

  it("finds a config file nested in a package but not one inside vendored code", () => {
    const nested = detectTools(
      snapshot({ paths: ["packages/web/eslint.config.mjs"] }),
      [tool("eslint", { configFiles: ["eslint.config.mjs"] })],
    );
    expect(nested).toHaveLength(1);

    const vendored = detectTools(
      snapshot({ paths: ["vendor/other/.golangci.yml"] }),
      [tool("golangci-lint", { configFiles: [".golangci.yml"] })],
    );
    expect(vendored).toEqual([]);
  });

  it("respects word boundaries when matching commands", () => {
    const found = detectTools(
      snapshot({
        paths: [".github/workflows/ci.yml"],
        files: {
          ".github/workflows/ci.yml":
            "jobs:\n  x:\n    steps:\n      - run: cat .trivyignore\n",
        },
      }),
      [tool("trivy", { commands: ["trivy"] })],
    );

    expect(found).toEqual([]);
  });

  it("prefers CI evidence over a config file for the same tool", () => {
    const found = detectTools(
      snapshot({
        paths: [".github/workflows/ci.yml", "trivy.yaml"],
        files: {
          ".github/workflows/ci.yml":
            "jobs:\n  scan:\n    steps:\n      - uses: aquasecurity/trivy-action@v0\n",
        },
      }),
      [
        tool("trivy", {
          ciUses: ["aquasecurity/trivy-action"],
          configFiles: ["trivy.yaml"],
        }),
      ],
    );

    expect(found[0].evidence).toBe("uses: aquasecurity/trivy-action");
  });

  it("still finds action references in CI that is not valid YAML", () => {
    const found = detectTools(
      snapshot({
        paths: [".github/workflows/ci.yml"],
        files: {
          ".github/workflows/ci.yml":
            "steps: [\n  - uses: codecov/codecov-action@v5\n",
        },
      }),
      [tool("codecov", { ciUses: ["codecov/codecov-action"] })],
    );

    expect(found).toHaveLength(1);
  });

  it("reports nothing when no signal fires", () => {
    expect(
      detectTools(snapshot({ paths: ["README.md"] }), [
        tool("eslint", { configFiles: ["eslint.config.mjs"] }),
      ]),
    ).toEqual([]);
  });
});
