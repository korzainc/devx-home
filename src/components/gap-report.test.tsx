/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GapReport } from "@/components/gap-report";
import { getBaseline, tools } from "@/lib/catalogue";
import { analyze } from "@/lib/gap/analyze";
import { ciSignals } from "@/lib/gap/detect";
import { applyLlmPass } from "@/lib/gap/llm/apply";
import { llm, provides, denies, responseFor } from "@/test/gap-fixtures";
import type { Analysis, BaselineStack, RepoSnapshot } from "@/lib/gap/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const stacks: BaselineStack[] = [
  { id: "javascript", label: "JavaScript", markers: [], expects: {} },
  { id: "go", label: "Go", markers: [], expects: {} },
];

function analysisWith(overrides: Partial<Analysis>): Analysis {
  return {
    repo: "korzainc/example",
    defaultBranch: "main",
    stacks: [],
    filesRead: [],
    categories: [],
    satisfiedCount: 0,
    partialCount: 0,
    gapCount: 0,
    buildSteps: [],
    ...overrides,
  };
}

describe("GapReport", () => {
  it("phrases a single-stack recommendation with no attribution, unchanged", () => {
    render(
      <GapReport
        stacks={stacks}
        analysis={analysisWith({
          gapCount: 1,
          categories: [
            {
              category: "Linting",
              capabilities: [
                {
                  id: "lint",
                  label: "Style linting",
                  satisfied: false,
                  present: [],
                  recommended: [
                    {
                      id: "eslint",
                      name: "ESLint",
                      stackLabels: ["JavaScript"],
                    },
                  ],
                },
              ],
            },
          ],
        })}
      />,
    );

    expect(
      screen.getByText("Nothing found. The catalogue recommends", {
        exact: false,
      }),
    ).toBeTruthy();
    expect(screen.queryByText(/for JavaScript/)).toBeNull();
    expect(screen.queryByText(/and one is enough/)).toBeNull();
  });

  it("phrases two stacks' distinct recommendations as required, not as alternatives", () => {
    render(
      <GapReport
        stacks={stacks}
        analysis={analysisWith({
          gapCount: 1,
          categories: [
            {
              category: "Linting",
              capabilities: [
                {
                  id: "lint",
                  label: "Style linting",
                  satisfied: false,
                  present: [],
                  recommended: [
                    {
                      id: "eslint",
                      name: "ESLint",
                      stackLabels: ["JavaScript"],
                    },
                    {
                      id: "golangci-lint",
                      name: "golangci-lint",
                      stackLabels: ["Go"],
                    },
                  ],
                },
              ],
            },
          ],
        })}
      />,
    );

    expect(screen.getByText(/for JavaScript/)).toBeTruthy();
    expect(screen.getByText(/for Go/)).toBeTruthy();
    expect(screen.queryByText(/and one is enough/)).toBeNull();
    expect(screen.queryByText(/ or /)).toBeNull();
    // Pins the Link-nesting invariant structurally: if "for JavaScript" ever leaked inside the
    // anchor, its accessible name would become "ESLint for JavaScript" and this lookup for a
    // link named exactly "ESLint" would fail to find it.
    expect(screen.getByRole("link", { name: "ESLint" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "golangci-lint" })).toBeTruthy();
  });

  it("joins with a semicolon when a merged tool's stack list would collide with the outer and", () => {
    render(
      <GapReport
        stacks={stacks}
        analysis={analysisWith({
          gapCount: 1,
          categories: [
            {
              category: "Security",
              capabilities: [
                {
                  id: "sca",
                  label: "Dependency Scanning (SCA)",
                  satisfied: false,
                  present: [],
                  recommended: [
                    {
                      id: "ci-base-checks",
                      name: "Korza CI Base Checks",
                      stackLabels: ["Docker", "Go"],
                    },
                    {
                      id: "npm-audit",
                      name: "npm audit",
                      stackLabels: ["JavaScript"],
                    },
                  ],
                },
              ],
            },
          ],
        })}
      />,
    );

    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          /Korza CI Base Checks for Docker and Go; and npm audit for JavaScript/.test(
            element.textContent ?? "",
          ),
      ),
    ).toBeTruthy();
    // The semicolon sits outside both links, same invariant as the plain "and" case.
    expect(
      screen.getByRole("link", { name: "Korza CI Base Checks" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "npm audit" })).toBeTruthy();
  });

  it("still phrases genuine alternatives with or and 'one is enough'", () => {
    render(
      <GapReport
        stacks={stacks}
        analysis={analysisWith({
          gapCount: 1,
          categories: [
            {
              category: "Security",
              capabilities: [
                {
                  id: "sast",
                  label: "SAST",
                  satisfied: false,
                  present: [],
                  recommended: [
                    { id: "semgrep", name: "Semgrep", stackLabels: [] },
                    { id: "codeql", name: "CodeQL", stackLabels: [] },
                  ],
                },
              ],
            },
          ],
        })}
      />,
    );

    // "Semgrep or CodeQL" spans two separate <Link> elements, so no single node holds that text.
    // getByText's string/regex matching only checks a node's own text, not text split across
    // elements, so a function matcher checks the paragraph's full textContent instead.
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          /Semgrep or CodeQL/.test(element.textContent ?? ""),
      ),
    ).toBeTruthy();
    expect(screen.getByText(/and one is enough/)).toBeTruthy();
  });

  it("derives the no-stack-detected message from the stacks prop, not a hardcoded list", () => {
    render(<GapReport stacks={stacks} analysis={analysisWith({})} />);

    expect(screen.getByText(/JavaScript, Go/)).toBeTruthy();
  });

  it("renders a partial capability with what's present, attributed, and what's still needed", () => {
    render(
      <GapReport
        stacks={stacks}
        analysis={analysisWith({
          categories: [
            {
              category: "Testing",
              capabilities: [
                {
                  id: "unit-tests",
                  label: "Unit tests",
                  satisfied: false,
                  present: [
                    {
                      id: "jest",
                      name: "Jest",
                      evidence: "jest.config.js",
                      stackLabels: ["JavaScript"],
                    },
                  ],
                  recommended: [
                    { id: "go-test", name: "go test", stackLabels: ["Go"] },
                  ],
                },
              ],
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("partial")).toBeTruthy();
    expect(screen.getByText(/Jest/)).toBeTruthy();
    expect(screen.getByText(/for JavaScript/)).toBeTruthy();
    expect(screen.getByText(/Still need/)).toBeTruthy();
    expect(screen.getByText(/for Go/)).toBeTruthy();
    expect(screen.queryByText("missing")).toBeNull();
  });

  it("names the partial count in the headline instead of folding it into the gap", () => {
    render(
      <GapReport
        stacks={stacks}
        analysis={analysisWith({
          satisfiedCount: 3,
          partialCount: 2,
          gapCount: 5,
          categories: [],
        })}
      />,
    );

    expect(
      screen.getByText("3 of 8 recommended checks are running", {
        exact: false,
      }),
    ).toBeTruthy();
    expect(screen.getByText(/plus 2 partially covered/)).toBeTruthy();
  });

  it("throws rather than silently render an unsatisfied capability with no recommendation", () => {
    const broken = analysisWith({
      categories: [
        {
          category: "Testing",
          capabilities: [
            {
              id: "unit-tests",
              label: "Unit tests",
              satisfied: false,
              present: [
                {
                  id: "jest",
                  name: "Jest",
                  evidence: "jest.config.js",
                  stackLabels: ["JavaScript"],
                },
              ],
              // A real analyze.ts result never leaves this empty here - this pins the
              // invariant check itself, not a reachable report shape.
              recommended: [],
            },
          ],
        },
      ],
    });

    expect(() =>
      render(<GapReport stacks={stacks} analysis={broken} />),
    ).toThrow(/has no recommendation/);
  });

  it("attributes a satisfied capability's tools when more than one covers it", () => {
    render(
      <GapReport
        stacks={stacks}
        analysis={analysisWith({
          satisfiedCount: 1,
          categories: [
            {
              category: "Linting",
              capabilities: [
                {
                  id: "lint",
                  label: "Style linting",
                  satisfied: true,
                  present: [
                    {
                      id: "eslint",
                      name: "ESLint",
                      evidence: "eslint.config.js",
                      stackLabels: ["JavaScript"],
                    },
                    {
                      id: "golangci-lint",
                      name: "golangci-lint",
                      evidence: ".golangci.yml",
                      stackLabels: ["Go"],
                    },
                  ],
                  recommended: [],
                },
              ],
            },
          ],
        })}
      />,
    );

    expect(screen.getByText(/ESLint for JavaScript/)).toBeTruthy();
    expect(screen.getByText(/golangci-lint for Go/)).toBeTruthy();
  });

  it("leaves a satisfied capability's lone, single-stack tool unattributed", () => {
    render(
      <GapReport
        stacks={stacks}
        analysis={analysisWith({
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
                      evidence: "vitest.config.ts",
                      stackLabels: ["JavaScript"],
                    },
                  ],
                  recommended: [],
                },
              ],
            },
          ],
        })}
      />,
    );

    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "LI" &&
          (element.textContent ?? "").trim().startsWith("Vitest "),
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/for JavaScript/)).toBeNull();
  });

  it("renders LLM-flipped results in rule order with no AI-specific markup", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const catalogue = { tools, baseline: getBaseline() };
    const semgrep = "semgrep --config p/java --error gateway-runtime/src";
    const trivy = "trivy fs --scanners vuln --exit-code 1 .";
    const snapshot: RepoSnapshot = {
      ref: { provider: "github", owner: "korza", repo: "gap-analysis-demo" },
      defaultBranch: "main",
      paths: ["pom.xml", "Dockerfile", ".github/workflows/ci.yml"],
      files: {
        "pom.xml": "<project></project>",
        Dockerfile: "FROM eclipse-temurin:21\n",
        ".github/workflows/ci.yml": [
          "jobs:",
          "  scan:",
          "    steps:",
          `      - run: ${semgrep}`,
          `      - run: ${trivy}`,
        ].join("\n"),
      },
    };
    const signals = ciSignals(snapshot);
    const rules = analyze(snapshot, catalogue, signals);
    const flipped = await applyLlmPass(
      rules,
      signals,
      catalogue,
      llm(
        responseFor(
          { analysis: rules, signals, catalogue },
          [
            provides("sast:semgrep", semgrep),
            denies("image-scan:trivy", trivy, "scans the filesystem"),
            denies("iac-config:trivy", trivy, "scans dependencies"),
          ],
          [],
        ),
      ),
    );
    const stacks = catalogue.baseline.stacks;
    const row = (label: string) =>
      screen.getByRole("heading", { name: label, level: 4 }).parentElement!
        .parentElement!;

    const { container } = render(
      <GapReport stacks={stacks} analysis={flipped} />,
    );

    expect(
      screen.getByRole("heading", {
        name: "2 of 10 recommended checks are running.",
        level: 2,
      }),
    ).toBeTruthy();

    const sast = row("Code Security (SAST)");
    expect(within(sast).getByText("present")).toBeTruthy();
    expect(
      within(sast).getByText(`runs ${semgrep} in .github/workflows/ci.yml`),
    ).toBeTruthy();
    for (const label of ["Container Scanning", "Infrastructure Config"]) {
      expect(within(row(label)).getByText("missing")).toBeTruthy();
      expect(
        within(row(label)).getByText(
          "Nothing found. The catalogue recommends",
          {
            exact: false,
          },
        ),
      ).toBeTruthy();
    }

    // Within a category, no running row may precede a missing one.
    for (const section of container.querySelectorAll("section")) {
      const chips = [...section.querySelectorAll("h4 + span")].map(
        (chip) => chip.textContent,
      );
      const firstRunning = chips.indexOf("present");
      if (firstRunning >= 0)
        expect(chips.slice(firstRunning)).toEqual(
          chips.slice(firstRunning).map(() => "present"),
        );
    }

    const stripped = {
      ...flipped,
      categories: flipped.categories.map((category) => ({
        ...category,
        capabilities: category.capabilities.map(
          ({ llmChanges: _llmChanges, ...capability }) => capability,
        ),
      })),
    };
    const flippedHtml = container.innerHTML;
    cleanup();
    const plain = render(<GapReport stacks={stacks} analysis={stripped} />);
    expect(plain.container.innerHTML).toBe(flippedHtml);
  });
});
