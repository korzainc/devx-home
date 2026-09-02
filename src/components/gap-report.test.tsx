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
});
