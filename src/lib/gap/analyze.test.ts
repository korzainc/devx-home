import { describe, expect, it } from "vitest";
import { analyze } from "./analyze";
import type { AnalysisTool, Baseline, RepoSnapshot } from "./types";

const baseline: Baseline = {
  categories: ["Security", "Testing", "Linting"],
  capabilities: {
    lint: { label: "Linting", category: "Linting" },
    "unit-tests": { label: "Unit tests", category: "Testing" },
    coverage: { label: "Coverage reporting", category: "Testing" },
    "e2e-tests": { label: "End-to-end tests", category: "Testing" },
    "secret-scanning": { label: "Secret scanning", category: "Security" },
    sast: { label: "SAST", category: "Security" },
  },
  universal: [{ id: "secret-scanning", required: true }],
  stacks: [
    {
      id: "javascript",
      label: "JavaScript",
      markers: ["package.json"],
      expects: {
        lint: { recommended: "eslint", acceptable: [], required: true },
        "unit-tests": { recommended: "vitest", acceptable: [], required: true },
        coverage: { recommended: "vitest", acceptable: [], required: true },
        // vitest resolves as a real tool id, but its own capabilities never include
        // e2e-tests, so this capability stays permanently unsatisfied regardless of what
        // any future snapshot detects.
        "e2e-tests": { recommended: "vitest", acceptable: [], required: true },
        sast: { recommended: "semgrep", acceptable: ["codeql"], required: true },
      },
    },
    {
      id: "java",
      label: "Java",
      markers: ["pom.xml"],
      expects: {
        lint: { recommended: "spotbugs", acceptable: [], required: true },
      },
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
    id: "ci-base-checks",
    name: "Korza CI Base Checks",
    capabilities: ["secret-scanning"],
    stacks: ["any"],
    detect: { ciUses: ["korzainc/shared-workflows/.github/workflows/ci.yml"] },
    wraps: [{ tool: "gitleaks", capabilities: ["secret-scanning"] }],
  },
  {
    id: "vitest",
    name: "Vitest",
    capabilities: ["unit-tests", "coverage"],
    stacks: ["javascript"],
    detect: { configFiles: ["vitest.config.ts"] },
  },
  {
    id: "semgrep",
    name: "Semgrep",
    capabilities: ["sast"],
    stacks: ["any"],
    detect: { configFiles: [".semgrep.yml"] },
  },
  {
    id: "codeql",
    name: "CodeQL",
    capabilities: ["sast"],
    stacks: ["any"],
    detect: { ciUses: ["github/codeql-action/analyze"] },
  },
];

function snapshot(paths: string[]): RepoSnapshot {
  return {
    ref: { provider: "github", owner: "korzainc", repo: "example" },
    defaultBranch: "main",
    paths,
    files: {},
  };
}

function capability(
  report: ReturnType<typeof analyze>,
  id: string,
): {
  satisfied: boolean;
  required: boolean;
  present: string[];
  recommended: string[];
} {
  for (const category of report.categories) {
    for (const entry of category.capabilities) {
      if (entry.id === id) {
        return {
          satisfied: entry.satisfied,
          required: entry.required,
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
    // A universal capability has no owning stack to read `required` from, so it carries its own.
    expect(capability(report, "secret-scanning").required).toBe(true);
    expect(report.gapCount).toBe(1);
    expect(report.requiredGapCount).toBe(1);
  });

  it("respects a universal capability marked optional, with no owning stack to override it", () => {
    const optionalUniversal: Baseline = {
      ...baseline,
      universal: [{ id: "secret-scanning", required: false }],
    };
    const report = analyze(snapshot(["README.md"]), {
      tools,
      baseline: optionalUniversal,
    });

    expect(capability(report, "secret-scanning").required).toBe(false);
    expect(report.gapCount).toBe(1);
    expect(report.requiredGapCount).toBe(0);
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
    // An `any` tool fits whatever was detected. gitleaks is wrapped by ci-base-checks, so
    // only ci-base-checks is recommended, never gitleaks itself.
    expect(capability(report, "secret-scanning").recommended).toEqual([
      "ci-base-checks",
    ]);
  });

  it("names only the stack's recommended tool, never its acceptable alternatives", () => {
    const report = analyze(snapshot(["package.json"]), { tools, baseline });

    // codeql is listed as acceptable for sast alongside semgrep's recommendation, but the
    // report only ever names the recommendation.
    expect(capability(report, "sast").recommended).toEqual(["semgrep"]);
  });

  it("unions every matched stack's own recommendation, not just the first stack's", () => {
    const report = analyze(snapshot(["package.json", "pom.xml"]), {
      tools,
      baseline,
    });

    // javascript recommends eslint for lint, java recommends spotbugs: both are real for
    // their half of a polyglot repo, neither dropped for matching second, and each is
    // attributed only to the stack that named it.
    const lint = report.categories
      .flatMap((category) => category.capabilities)
      .find((entry) => entry.id === "lint")!;
    expect(lint.recommended).toEqual([
      { id: "eslint", name: "ESLint", stackLabels: ["JavaScript"] },
      { id: "spotbugs", name: "SpotBugs", stackLabels: ["Java"] },
    ]);
  });

  it("merges two stacks that name the same tool into one entry with both labels", () => {
    // Both stacks recommend gitleaks's own bundle for secret-scanning (an `any`-stack tool),
    // by way of the shared `secret-scanning` capability being reachable from both `javascript`
    // and a synthetic second stack that also expects it.
    const merged: Baseline = {
      ...baseline,
      stacks: [
        baseline.stacks[0],
        {
          id: "java",
          label: "Java",
          markers: ["pom.xml"],
          expects: {
            "secret-scanning": {
              recommended: "ci-base-checks",
              acceptable: [],
              required: true,
            },
          },
        },
      ],
    };
    // javascript's own expects has no secret-scanning entry (it's universal in this fixture),
    // so this baseline adds it there too to force the merge.
    merged.stacks[0] = {
      ...merged.stacks[0],
      expects: {
        ...merged.stacks[0].expects,
        "secret-scanning": {
          recommended: "ci-base-checks",
          acceptable: [],
          required: true,
        },
      },
    };

    const report = analyze(snapshot(["package.json", "pom.xml"]), {
      tools,
      baseline: merged,
    });

    const capability = report.categories
      .flatMap((category) => category.capabilities)
      .find((entry) => entry.id === "secret-scanning")!;
    expect(capability.recommended).toEqual([
      {
        id: "ci-base-checks",
        name: "Korza CI Base Checks",
        stackLabels: ["JavaScript", "Java"],
      },
    ]);
  });

  it("reports a capability partially covered when only some owning stacks have a present tool", () => {
    const report = analyze(
      snapshot(["package.json", "pom.xml", "eslint.config.mjs"]),
      { tools, baseline },
    );

    const lint = report.categories
      .flatMap((category) => category.capabilities)
      .find((entry) => entry.id === "lint")!;

    expect(lint.satisfied).toBe(false);
    expect(lint.present).toEqual([
      {
        id: "eslint",
        name: "ESLint",
        evidence: expect.any(String),
        stackLabels: ["JavaScript"],
      },
    ]);
    expect(lint.recommended).toEqual([
      { id: "spotbugs", name: "SpotBugs", stackLabels: ["Java"] },
    ]);
    expect(report.partialCount).toBe(1);
    expect(report.gapCount).toBe(6);
  });

  it("excludes a present tool that doesn't apply to any owning stack, rather than reporting it partial", () => {
    // No package.json, so javascript is never a detected stack here - eslint.config.mjs is a
    // stray file (e.g. from a nested frontend), not evidence that JavaScript's lint tool covers
    // this Java repo's own gap.
    const report = analyze(snapshot(["pom.xml", "eslint.config.mjs"]), {
      tools,
      baseline,
    });

    const lint = report.categories
      .flatMap((category) => category.capabilities)
      .find((entry) => entry.id === "lint")!;

    expect(lint.satisfied).toBe(false);
    expect(lint.present).toEqual([]);
    expect(lint.recommended).toEqual([
      { id: "spotbugs", name: "SpotBugs", stackLabels: ["Java"] },
    ]);
    expect(report.partialCount).toBe(0);
  });

  it("still reports satisfied when every owning stack has a present tool", () => {
    const report = analyze(
      snapshot([
        "package.json",
        "pom.xml",
        "eslint.config.mjs",
        "spotbugs-exclude.xml",
        ".semgrep.yml",
      ]),
      { tools, baseline },
    );

    const capabilities = report.categories.flatMap(
      (category) => category.capabilities,
    );
    const lint = capabilities.find((entry) => entry.id === "lint")!;
    expect(lint.satisfied).toBe(true);
    expect(lint.recommended).toEqual([]);

    // sast is owned only by `javascript`, and semgrep is an `"any"`-stack tool (`stacks:
    // ["any"]`) - unlike lint's stack-specific tools above, this exercises a present tool whose
    // own stacks never match a real owning stack id, so it gets no single stack to attribute.
    const sast = capabilities.find((entry) => entry.id === "sast")!;
    expect(sast.satisfied).toBe(true);
    expect(sast.present[0]?.stackLabels).toEqual([]);

    // Nothing is left partial once every owning stack is covered.
    expect(report.partialCount).toBe(0);
  });

  it("lets a present any-stack tool cover every owning stack at once", () => {
    const anyBaseline: Baseline = {
      categories: ["Security"],
      capabilities: {
        "secret-scanning": { label: "Secrets", category: "Security" },
      },
      universal: [],
      stacks: [
        {
          id: "javascript",
          label: "JavaScript",
          markers: ["package.json"],
          expects: {
            "secret-scanning": {
              recommended: "gitleaks",
              acceptable: [],
              required: true,
            },
          },
        },
        {
          id: "java",
          label: "Java",
          markers: ["pom.xml"],
          expects: {
            "secret-scanning": {
              recommended: "gitleaks",
              acceptable: [],
              required: true,
            },
          },
        },
      ],
    };

    const report = analyze(
      snapshot(["package.json", "pom.xml", ".gitleaks.toml"]),
      {
        tools,
        baseline: anyBaseline,
      },
    );

    const secrets = report.categories
      .flatMap((category) => category.capabilities)
      .find((entry) => entry.id === "secret-scanning")!;

    expect(secrets.satisfied).toBe(true);
    expect(secrets.present).toEqual([
      {
        id: "gitleaks",
        name: "Gitleaks",
        evidence: expect.any(String),
        stackLabels: [],
      },
    ]);
  });

  it("throws when the baseline names a tool id absent from the catalogue", () => {
    const orphanBaseline: Baseline = {
      categories: ["Linting"],
      capabilities: { orphan: { label: "Orphan", category: "Linting" } },
      universal: [],
      stacks: [
        {
          id: "javascript",
          label: "JavaScript",
          markers: ["package.json"],
          expects: {
            orphan: {
              recommended: "no-such-tool",
              acceptable: [],
              required: true,
            },
          },
        },
      ],
    };

    expect(() =>
      analyze(snapshot(["package.json"]), { tools, baseline: orphanBaseline }),
    ).toThrow(/no-such-tool/);
  });

  it("orders categories by the baseline and puts unknown ones last", () => {
    const report = analyze(snapshot(["package.json"]), { tools, baseline });

    expect(report.categories.map((entry) => entry.category)).toEqual([
      "Security",
      "Testing",
      "Linting",
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
      false,
      true,
      true,
    ]);
    expect(testing?.capabilities.map((entry) => entry.label)).toEqual([
      "End-to-end tests",
      "Coverage reporting",
      "Unit tests",
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

    // lint, unit-tests, coverage, e2e-tests, sast, secret-scanning.
    expect(report.satisfiedCount + report.gapCount).toBe(6);
    expect(report.satisfiedCount).toBe(1);
  });

  it("reports the repo, branch and files it read", () => {
    const report = analyze(
      {
        ref: { provider: "github", owner: "korzainc", repo: "devx-home" },
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

  it("computes required as true if any owning stack requires it, not just the first stack listed", () => {
    // Mirrors the real cross-ecosystem conflict: javascript's format is optional, python's is
    // required, and a repo can own both at once.
    const formatBaseline: Baseline = {
      categories: ["Formatting"],
      capabilities: { format: { label: "Format", category: "Formatting" } },
      universal: [],
      stacks: [
        {
          id: "javascript",
          label: "JavaScript",
          markers: ["package.json"],
          expects: {
            format: { recommended: "prettier", acceptable: [], required: false },
          },
        },
        {
          id: "python",
          label: "Python",
          markers: ["pyproject.toml"],
          expects: {
            format: { recommended: "black", acceptable: [], required: true },
          },
        },
      ],
    };
    const formatTools: AnalysisTool[] = [
      {
        id: "prettier",
        name: "Prettier",
        capabilities: ["format"],
        stacks: ["javascript"],
        detect: { configFiles: [".prettierrc"] },
      },
      {
        id: "black",
        name: "Black",
        capabilities: ["format"],
        stacks: ["python"],
        detect: { configFiles: ["pyproject-black.toml"] },
      },
    ];

    const report = analyze(snapshot(["package.json", "pyproject.toml"]), {
      tools: formatTools,
      baseline: formatBaseline,
    });

    expect(capability(report, "format").satisfied).toBe(false);
    const format = report.categories
      .flatMap((category) => category.capabilities)
      .find((entry) => entry.id === "format")!;
    expect(format.required).toBe(true);
  });

  it("computes required as true for a capability whose only owning stack requires it", () => {
    const report = analyze(snapshot(["package.json"]), { tools, baseline });

    // Only `javascript` is detected, and it's `lint` entry is `required: true`.
    const lint = report.categories
      .flatMap((category) => category.capabilities)
      .find((entry) => entry.id === "lint")!;
    expect(lint.required).toBe(true);
  });

  it("computes required as false for a capability whose only owning stack marks it optional", () => {
    const optionalBaseline: Baseline = {
      categories: ["Testing"],
      capabilities: {
        coverage: { label: "Coverage reporting", category: "Testing" },
      },
      universal: [],
      stacks: [
        {
          id: "javascript",
          label: "JavaScript",
          markers: ["package.json"],
          expects: {
            coverage: { recommended: "vitest", acceptable: [], required: false },
          },
        },
      ],
    };

    const report = analyze(snapshot(["package.json"]), {
      tools,
      baseline: optionalBaseline,
    });

    const coverage = report.categories
      .flatMap((category) => category.capabilities)
      .find((entry) => entry.id === "coverage")!;
    expect(coverage.required).toBe(false);
  });

  it("adds required-scoped counts alongside the existing all-capability counts, without changing them", () => {
    const mixedBaseline: Baseline = {
      categories: ["Testing", "Linting"],
      capabilities: {
        "unit-tests": { label: "Unit tests", category: "Testing" },
        "e2e-tests": { label: "End-to-end tests", category: "Testing" },
        coverage: { label: "Coverage reporting", category: "Testing" },
        sast: { label: "SAST", category: "Testing" },
        lint: { label: "Linting", category: "Linting" },
      },
      universal: [],
      stacks: [
        {
          id: "javascript",
          label: "JavaScript",
          markers: ["package.json"],
          expects: {
            "unit-tests": {
              recommended: "jest",
              acceptable: [],
              required: true,
            },
            "e2e-tests": {
              recommended: "playwright",
              acceptable: [],
              required: false,
            },
            coverage: {
              recommended: "vitest",
              acceptable: [],
              required: false,
            },
            sast: { recommended: "semgrep", acceptable: [], required: true },
            lint: { recommended: "eslint", acceptable: [], required: true },
          },
        },
        {
          id: "java",
          label: "Java",
          markers: ["pom.xml"],
          expects: {
            lint: { recommended: "spotbugs", acceptable: [], required: true },
          },
        },
      ],
    };
    const mixedTools: AnalysisTool[] = [
      {
        id: "jest",
        name: "Jest",
        capabilities: ["unit-tests"],
        stacks: ["javascript"],
        detect: { configFiles: ["jest.config.js"] },
      },
      {
        id: "playwright",
        name: "Playwright",
        capabilities: ["e2e-tests"],
        stacks: ["javascript"],
        detect: { configFiles: ["playwright.config.ts"] },
      },
      {
        id: "vitest",
        name: "Vitest",
        capabilities: ["coverage"],
        stacks: ["javascript"],
        detect: { configFiles: ["vitest.config.ts"] },
      },
      {
        id: "semgrep",
        name: "Semgrep",
        capabilities: ["sast"],
        stacks: ["javascript"],
        detect: { configFiles: [".semgrep.yml"] },
      },
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
    ];

    // Present: jest (required, satisfied), playwright (optional, satisfied), eslint (required,
    // partial - java's own spotbugs is missing). Absent: vitest (optional, gap), semgrep
    // (required, gap), spotbugs (required, only half of lint's partial coverage).
    const report = analyze(
      snapshot([
        "package.json",
        "pom.xml",
        "jest.config.js",
        "playwright.config.ts",
        "eslint.config.mjs",
      ]),
      { tools: mixedTools, baseline: mixedBaseline },
    );

    // All-capability counts: unit-tests + e2e-tests satisfied, lint partial, coverage + sast gap.
    expect(report.satisfiedCount).toBe(2);
    expect(report.partialCount).toBe(1);
    expect(report.gapCount).toBe(3);

    // Required-scoped counts exclude e2e-tests and coverage, both `required: false`.
    expect(report.requiredSatisfiedCount).toBe(1);
    expect(report.requiredPartialCount).toBe(1);
    expect(report.requiredGapCount).toBe(2);
  });
});
