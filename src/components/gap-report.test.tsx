/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GapReport } from "@/components/gap-report";
import type { Analysis, BaselineStack } from "@/lib/gap/types";

afterEach(cleanup);

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
    ).toThrow(/analyze\.ts's invariant is broken/);
  });
});
