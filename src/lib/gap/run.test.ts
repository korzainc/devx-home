import { describe, expect, it, vi } from "vitest";
import { runAnalysis } from "./run";
import type { AnalysisTool, Baseline } from "./types";

// vitest hoists vi.mock calls above the imports above, regardless of where they're written -
// runAnalysis (imported above) sees this mocked module, never a real network call.
vi.mock("./github", () => ({
  githubReader: {
    parseRef: (input: string) =>
      input === "korzainc/example"
        ? { provider: "github" as const, owner: "korzainc", repo: "example" }
        : null,
    loadSnapshot: async () => ({
      ref: { provider: "github" as const, owner: "korzainc", repo: "example" },
      defaultBranch: "main",
      paths: ["package.json"],
      files: {},
    }),
  },
}));

describe("runAnalysis", () => {
  it("maps a CatalogueDataError to a clean ok:false result instead of throwing", async () => {
    // A minimal baseline/tools pair that will make analyze() throw: a stack recommends a tool
    // id absent from `tools`.
    const baseline: Baseline = {
      categories: ["Linting"],
      capabilities: { orphan: { label: "Orphan", category: "Linting" } },
      universal: [],
      stacks: [
        {
          id: "javascript",
          label: "JavaScript",
          markers: ["package.json"],
          expects: { orphan: { recommended: "no-such-tool", acceptable: [] } },
        },
      ],
    };
    const tools: AnalysisTool[] = [];

    const result = await runAnalysis("korzainc/example", "token", {
      tools,
      baseline,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(500);
      expect(result.error).toContain("no-such-tool");
    }
  });
});
