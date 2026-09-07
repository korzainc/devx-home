/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GapReport } from "@/components/gap-report";
import { GAP_OPTIONAL_TOGGLE_ID } from "@/lib/gap/optional-toggle";
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
    requiredSatisfiedCount: 0,
    requiredPartialCount: 0,
    requiredGapCount: 0,
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
                  required: true,
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
                  required: true,
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
                  required: true,
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
                  required: true,
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
                  required: true,
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
          // The headline now reads the required-scoped counts; this fixture has no optional
          // capabilities, so they match the all-capability ones above.
          requiredSatisfiedCount: 3,
          requiredPartialCount: 2,
          requiredGapCount: 5,
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
              required: true,
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
                  required: true,
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
                  required: true,
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

  it("tags an optional capability's name with 'optional', and leaves a required one untagged", () => {
    render(
      <GapReport
        stacks={stacks}
        analysis={analysisWith({
          satisfiedCount: 2,
          requiredSatisfiedCount: 1,
          categories: [
            {
              category: "Testing",
              capabilities: [
                {
                  id: "coverage",
                  label: "Coverage reporting",
                  required: false,
                  satisfied: true,
                  present: [
                    {
                      id: "codecov",
                      name: "Codecov",
                      evidence: "codecov.yml",
                      stackLabels: [],
                    },
                  ],
                  recommended: [],
                },
                {
                  id: "unit-tests",
                  label: "Unit tests",
                  required: true,
                  satisfied: true,
                  present: [
                    {
                      id: "vitest",
                      name: "Vitest",
                      evidence: "vitest.config.ts",
                      stackLabels: [],
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

    // Exactly one capability here is optional, so exactly one "optional" tag should render.
    expect(screen.getAllByText("optional")).toHaveLength(1);
  });

  it("renders 'skipped' for an optional capability with nothing present, and 'missing' for a required one", () => {
    render(
      <GapReport
        stacks={stacks}
        analysis={analysisWith({
          gapCount: 2,
          requiredGapCount: 1,
          categories: [
            {
              category: "Testing",
              capabilities: [
                {
                  id: "dependency-updates",
                  label: "Dependency updates",
                  required: false,
                  satisfied: false,
                  present: [],
                  recommended: [],
                },
                {
                  id: "secrets",
                  label: "Secret scanning",
                  required: true,
                  satisfied: false,
                  present: [],
                  recommended: [],
                },
              ],
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("skipped")).toBeTruthy();
    expect(screen.getByText("missing")).toBeTruthy();
  });

  it("renders a checkbox labeled with the live optional count, wired to GAP_OPTIONAL_TOGGLE_ID", () => {
    render(
      <GapReport
        stacks={stacks}
        analysis={analysisWith({
          // All three capabilities are gaps (unsatisfied), so gapCount must reflect that -
          // otherwise `expected` stays 0 and the report reads as "no stack detected," hiding the
          // very checkbox this test exists to check for.
          gapCount: 3,
          categories: [
            {
              category: "Testing",
              capabilities: [
                {
                  id: "coverage",
                  label: "Coverage reporting",
                  required: false,
                  satisfied: false,
                  present: [],
                  recommended: [],
                },
                {
                  id: "dependency-updates",
                  label: "Dependency updates",
                  required: false,
                  satisfied: false,
                  present: [],
                  recommended: [],
                },
                {
                  id: "docs",
                  label: "Docs generation",
                  required: false,
                  satisfied: false,
                  present: [],
                  recommended: [],
                },
              ],
            },
          ],
        })}
      />,
    );

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.id).toBe(GAP_OPTIONAL_TOGGLE_ID);
    expect(
      screen.getByText("Include 3 optional checks", { exact: false }),
    ).toBeTruthy();
  });

  it("singularizes the checkbox label at a count of exactly one", () => {
    render(
      <GapReport
        stacks={stacks}
        analysis={analysisWith({
          gapCount: 1,
          categories: [
            {
              category: "Testing",
              capabilities: [
                {
                  id: "coverage",
                  label: "Coverage reporting",
                  required: false,
                  satisfied: false,
                  present: [],
                  recommended: [],
                },
              ],
            },
          ],
        })}
      />,
    );

    expect(
      screen.getByText("Include 1 optional check", { exact: false }),
    ).toBeTruthy();
    expect(screen.queryByText(/1 optional checks/)).toBeNull();
  });

  it("points the checkbox's aria-controls at every optional row and all-optional section it reveals", () => {
    render(
      <GapReport
        stacks={stacks}
        analysis={analysisWith({
          gapCount: 2,
          categories: [
            {
              category: "Testing",
              capabilities: [
                {
                  id: "unit-tests",
                  label: "Unit tests",
                  required: true,
                  satisfied: true,
                  present: [
                    {
                      id: "jest",
                      name: "Jest",
                      evidence: "package.json",
                      stackLabels: [],
                    },
                  ],
                  recommended: [],
                },
                {
                  id: "coverage",
                  label: "Coverage reporting",
                  required: false,
                  satisfied: false,
                  present: [],
                  recommended: [],
                },
              ],
            },
            {
              category: "Dependencies",
              capabilities: [
                {
                  id: "dependency-updates",
                  label: "Dependency updates",
                  required: false,
                  satisfied: false,
                  present: [],
                  recommended: [],
                },
              ],
            },
          ],
        })}
      />,
    );

    const checkbox = screen.getByRole("checkbox");
    const controls = checkbox.getAttribute("aria-controls")?.split(" ");
    expect(controls).toContain("gap-optional-coverage");
    expect(controls).toContain("gap-optional-section-dependencies");
    // The required, satisfied capability in the mixed category is never a target.
    expect(controls).not.toContain("gap-optional-unit-tests");

    for (const id of controls ?? []) {
      expect(document.getElementById(id)).not.toBeNull();
    }
  });

  it("hides the optional-coverage line and the reveal checkbox when no stack was detected", () => {
    // No `categories` override at all means noStackDetected is true (analysisWith's defaults).
    // Both the "Optional: ..." line and the checkbox would otherwise render nonsense - "Include 0
    // optional checks" under a headline saying no stack was even found.
    render(<GapReport stacks={stacks} analysis={analysisWith({})} />);

    expect(screen.getByText("No recognized stack was detected.")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/^Optional:/)).toBeNull();
  });

  it("marks every optional capability row and every all-optional category section with gap-optional-row", () => {
    const { container } = render(
      <GapReport
        stacks={stacks}
        analysis={analysisWith({
          satisfiedCount: 2,
          requiredSatisfiedCount: 1,
          categories: [
            {
              category: "Linting",
              capabilities: [
                {
                  id: "lint",
                  label: "Style linting",
                  required: true,
                  satisfied: true,
                  present: [
                    {
                      id: "eslint",
                      name: "ESLint",
                      evidence: "eslint.config.js",
                      stackLabels: [],
                    },
                  ],
                  recommended: [],
                },
                {
                  id: "coverage",
                  label: "Coverage reporting",
                  required: false,
                  satisfied: false,
                  present: [],
                  recommended: [],
                },
              ],
            },
            {
              category: "Security",
              capabilities: [
                {
                  id: "sast",
                  label: "SAST",
                  required: false,
                  satisfied: true,
                  present: [
                    {
                      id: "codeql",
                      name: "CodeQL",
                      evidence: "codeql.yml",
                      stackLabels: [],
                    },
                  ],
                  recommended: [],
                },
                {
                  id: "secrets",
                  label: "Secret scanning",
                  required: false,
                  satisfied: false,
                  present: [],
                  recommended: [],
                },
              ],
            },
          ],
        })}
      />,
    );

    // Mixed category: only the one optional (skipped) row is marked, not the section itself.
    const lintingSection = screen.getByText("Linting").closest("section");
    expect(lintingSection?.classList.contains("gap-optional-row")).toBe(false);

    // All-optional category: the section itself is marked, alongside both of its rows (one
    // through the normal render path, one through the skipped early return).
    const securitySection = screen.getByText("Security").closest("section");
    expect(securitySection?.classList.contains("gap-optional-row")).toBe(true);

    expect(container.querySelectorAll(".gap-optional-row")).toHaveLength(4);
  });

  it("uses the required-scoped counts for the headline and progress bar, not the all-capability ones", () => {
    render(
      <GapReport
        stacks={stacks}
        analysis={analysisWith({
          satisfiedCount: 5,
          partialCount: 2,
          gapCount: 3,
          requiredSatisfiedCount: 2,
          requiredPartialCount: 1,
          requiredGapCount: 1,
          categories: [],
        })}
      />,
    );

    expect(
      screen.getByText("2 of 3 recommended checks are running", {
        exact: false,
      }),
    ).toBeTruthy();
    expect(screen.getByText(/plus 1 partially covered/)).toBeTruthy();
    expect(screen.queryByText(/plus 2 partially covered/)).toBeNull();
    expect(screen.queryByText(/5 of 8/)).toBeNull();
  });

  // Everything above checks GapReport's own markup. These check what it hands to
  // FixPromptButton -- that the two includeOptional flags aren't swapped and the counts passed
  // down are the right fields -- by clicking through the real, rendered button rather than
  // inspecting props, matching this file's existing render-and-query style.
  describe("wiring into FixPromptButton", () => {
    // Same jsdom gaps fix-prompt.test.tsx already documents: no matchMedia, no <dialog> behavior.
    beforeEach(() => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }));
      HTMLDialogElement.prototype.showModal = vi.fn(function (
        this: HTMLDialogElement,
      ) {
        this.setAttribute("open", "");
      });
      HTMLDialogElement.prototype.close = vi.fn(function (
        this: HTMLDialogElement,
      ) {
        this.removeAttribute("open");
        this.dispatchEvent(new Event("close"));
      });
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    function clickGenerate() {
      fireEvent.click(
        screen.getByRole("button", { name: /generate fix prompt/i }),
      );
      act(() => {
        vi.advanceTimersByTime(700);
      });
    }

    const wiringAnalysis = analysisWith({
      gapCount: 2,
      requiredGapCount: 1,
      categories: [
        {
          category: "Security",
          capabilities: [
            {
              id: "secret-scanning",
              label: "Secret scanning",
              required: true,
              satisfied: false,
              present: [],
              recommended: [
                { id: "gitleaks", name: "Gitleaks", stackLabels: [] },
              ],
            },
          ],
        },
        {
          category: "Testing",
          capabilities: [
            {
              id: "coverage",
              label: "Coverage reporting",
              required: false,
              satisfied: false,
              present: [],
              recommended: [
                { id: "codecov", name: "Codecov", stackLabels: [] },
              ],
            },
          ],
        },
      ],
    });

    it("does not render a fix-prompt button when there is nothing to fix", () => {
      render(
        <GapReport
          stacks={stacks}
          analysis={analysisWith({ gapCount: 0, categories: [] })}
        />,
      );
      expect(
        screen.queryByRole("button", { name: /generate fix prompt/i }),
      ).toBeNull();
    });

    it("excludes optional gaps from the prompt while the reveal checkbox is unchecked", () => {
      render(<GapReport stacks={stacks} analysis={wiringAnalysis} />);

      clickGenerate();

      const dialog = within(screen.getByRole("dialog"));
      expect(
        dialog.getByText("1 required check", { exact: false }),
      ).toBeTruthy();
      expect(dialog.getByText(/Gitleaks/)).toBeTruthy();
      expect(dialog.queryByText(/Codecov/)).toBeNull();
    });

    it("includes optional gaps once the reveal checkbox is checked, without swapping scope", () => {
      render(<GapReport stacks={stacks} analysis={wiringAnalysis} />);

      fireEvent.click(screen.getByRole("checkbox"));
      clickGenerate();

      const dialog = within(screen.getByRole("dialog"));
      expect(
        dialog.getByText("2 checks, including 1 optional", { exact: false }),
      ).toBeTruthy();
      expect(dialog.getByText(/Gitleaks/)).toBeTruthy();
      expect(dialog.getByText(/Codecov/)).toBeTruthy();
    });
  });
});
