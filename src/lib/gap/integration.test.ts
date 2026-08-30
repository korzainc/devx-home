import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  analysisBaseline,
  analysisTools,
  catalogueSource,
} from "@/lib/catalogue";
import { analyze } from "./analyze";
import type { RepoSnapshot } from "./types";

// The whole path in one test: real catalogue, real adapter, real analysis, real patch. The unit
// tests each mock the layer below them, so this is the only place a mismatch between the
// catalogue's capability ids and the analysis's own would show up.

const workflow = `name: CI

on:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: mvn test
`;

function javaRepo(
  files: Record<string, string>,
  paths: string[],
): RepoSnapshot {
  return {
    ref: { provider: "github" as const, owner: "korzainc", repo: "billing" },
    defaultBranch: "main",
    paths,
    files,
  };
}

const snapshot = javaRepo(
  { ".github/workflows/ci.yml": workflow, "pom.xml": "<project/>" },
  ["pom.xml", "Dockerfile", ".trivyignore", ".github/workflows/ci.yml"],
);

const analysis = analyze(
  snapshot,
  { tools: analysisTools, baseline: analysisBaseline },
  catalogueSource,
);

describe("gap analysis with fixes, end to end", () => {
  it("detects the java baseline", () => {
    expect(analysis.stacks.map((stack) => stack.id)).toEqual(["java"]);
  });

  it("speaks the catalogue's capability vocabulary, not the placeholder's", () => {
    const ids = analysis.categories.flatMap((c) =>
      c.capabilities.map((cap) => cap.id),
    );
    expect(ids).toContain("secrets");
    expect(ids).not.toContain("secret-scanning");
  });

  it("does not offer a fix for a check the repo already runs", () => {
    // The fixture runs `mvn test`, which is JUnit, so unit-tests is satisfied rather than a gap.
    const capabilities = analysis.categories.flatMap((c) => c.capabilities);
    expect(capabilities.find((c) => c.id === "unit-tests")?.satisfied).toBe(
      true,
    );
    expect(analysis.fixes.unwired.map((u) => u.capability)).not.toContain(
      "unit-tests",
    );
  });

  it("coalesces every bundle-covered gap into a single block", () => {
    expect(analysis.fixes.blocks).toHaveLength(1);
    const block = analysis.fixes.blocks[0];
    expect(block.entryId).toBe("ci-base-checks");
    // sca and iac-config are already covered by the detected Trivy config, so the bundle is
    // here for the two that are genuinely missing - and still renders as one block, not two.
    expect(block.capabilities.sort()).toEqual(["sast", "secrets"]);
  });

  it("reports a gap it cannot wire rather than inventing a step for it", () => {
    expect(analysis.fixes.unwired.map((u) => u.capability)).toEqual([
      "lint-bugs",
    ]);
    expect(analysis.fixes.unwired[0].candidates).toContain("spotbugs");
  });

  it("anchors the patch into the repo's own workflow", () => {
    expect(analysis.fixes.patch?.mode).toBe("edit");
    expect(analysis.fixes.patch?.path).toBe(".github/workflows/ci.yml");
  });

  it("applies cleanly, leaving a workflow that still parses", () => {
    const patch = analysis.fixes.patch!;
    const lines = workflow.split("\n");
    const insertAt =
      patch.lines.find((line) => line.kind === "added")!.number - 1;
    lines.splice(insertAt, 0, ...patch.clean.split("\n"), "");
    const parsed = parseYaml(lines.join("\n"));
    expect(Object.keys(parsed.jobs).sort()).toEqual(["ci-base-checks", "test"]);
  });

  it("tailors the Dockerfile argument from the repo's own tree", () => {
    expect(analysis.fixes.patch?.clean).toContain(
      'dockerfile_path: "Dockerfile"',
    );
    expect(analysis.fixes.patch?.clean).toContain(
      'sca_ignore_file: ".trivyignore"',
    );
  });

  it("scaffolds a new file for a repo with no workflow at all", () => {
    const bare = analyze(
      javaRepo({ "pom.xml": "<project/>" }, ["pom.xml"]),
      { tools: analysisTools, baseline: analysisBaseline },
      catalogueSource,
    );
    expect(bare.fixes.patch?.mode).toBe("create");
    expect(parseYaml(bare.fixes.patch!.clean).jobs).toHaveProperty(
      "ci-base-checks",
    );
  });

  it("carries no fixes when the caller does not pass the catalogue", () => {
    const without = analyze(snapshot, {
      tools: analysisTools,
      baseline: analysisBaseline,
    });
    expect(without.fixes).toEqual({ blocks: [], patch: null, unwired: [] });
  });
});
