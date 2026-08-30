import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import catalogueData from "@/data/catalogue.json";
import type { Catalogue } from "@/lib/catalogue/schema";
import { planFixes } from "./fix";
import {
  buildPatch,
  chooseTargetFile,
  detectIndent,
  existingJobIds,
  scaffold,
} from "./patch";
import type { RepoSnapshot } from "./types";

const catalogue = catalogueData as unknown as Catalogue;

const simpleWorkflow = `name: CI

on:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
`;

// Four-space indent, a trailing comment, and the word "jobs:" inside a string - each of which
// breaks a naive line scan.
const awkwardWorkflow = `name: Build

on:
    push:
        branches: [main]

env:
    NOTE: "these jobs: are not a mapping"

jobs:
    build:
        runs-on: ubuntu-latest
        steps:
            - run: echo "done"

# trailing comment after the last job
`;

function snapshot(
  files: Record<string, string>,
  paths: string[] = [],
): RepoSnapshot {
  return {
    ref: { provider: "github" as const, owner: "korzainc", repo: "example" },
    defaultBranch: "main",
    paths: [...paths, ...Object.keys(files)],
    files,
  };
}

const blocks = planFixes(
  ["sca"],
  ["java"],
  snapshot({}, ["pom.xml"]),
  catalogue,
).blocks;

describe("detectIndent", () => {
  it("reads two-space indentation", () => {
    expect(detectIndent(simpleWorkflow)).toBe("  ");
  });

  it("reads four-space indentation rather than assuming two", () => {
    expect(detectIndent(awkwardWorkflow)).toBe("    ");
  });
});

describe("existingJobIds", () => {
  it("lists the file's own job ids", () => {
    expect(existingJobIds(simpleWorkflow)).toEqual(["test"]);
  });

  it("is not fooled by the word jobs inside a string", () => {
    expect(existingJobIds(awkwardWorkflow)).toEqual(["build"]);
  });

  it("returns nothing for a file that will not parse", () => {
    expect(existingJobIds("{{ not yaml")).toEqual([]);
  });
});

describe("chooseTargetFile", () => {
  it("prefers the workflow that gates pull requests", () => {
    const files = {
      ".github/workflows/release.yml":
        "on:\n  push:\n    tags: ['v*']\njobs:\n  a:\n    runs-on: x\n",
      ".github/workflows/pr.yml":
        "on:\n  pull_request:\njobs:\n  b:\n    runs-on: x\n",
    };
    expect(chooseTargetFile(snapshot(files))).toBe(".github/workflows/pr.yml");
  });

  it("returns nothing when the repo has no workflow", () => {
    expect(chooseTargetFile(snapshot({ "package.json": "{}" }))).toBeNull();
  });
});

describe("buildPatch - editing an existing file", () => {
  it("anchors the insertion after the last job, not at the end of the file", () => {
    const patch = buildPatch(
      blocks,
      snapshot({ ".github/workflows/ci.yml": awkwardWorkflow }),
    )!;
    expect(patch.mode).toBe("edit");
    const firstAdded = patch.lines.find((line) => line.kind === "added")!;
    // The last job line is 15; the comment below it must stay below the inserted block.
    expect(firstAdded.number).toBeGreaterThan(14);
    const trailing = patch.lines.filter(
      (l) => l.kind === "context" && l.text.startsWith("#"),
    );
    expect(trailing.length).toBeGreaterThan(0);
  });

  it("produces a file that still parses once applied", () => {
    const patch = buildPatch(
      blocks,
      snapshot({ ".github/workflows/ci.yml": simpleWorkflow }),
    )!;
    const applied = simpleWorkflow.split("\n");
    const insertAt = patch.lines.find((l) => l.kind === "added")!.number - 1;
    applied.splice(insertAt, 0, ...patch.clean.split("\n"), "");
    const parsed = parseYaml(applied.join("\n"));
    expect(Object.keys(parsed.jobs).sort()).toEqual(["ci-base-checks", "test"]);
  });

  it("matches the target file's own indentation", () => {
    const patch = buildPatch(
      blocks,
      snapshot({ ".github/workflows/ci.yml": awkwardWorkflow }),
    )!;
    expect(patch.clean.split("\n")[0]).toMatch(/^ {4}ci-base-checks:/);
  });

  it("never proposes removing a line", () => {
    const patch = buildPatch(
      blocks,
      snapshot({ ".github/workflows/ci.yml": simpleWorkflow }),
    )!;
    expect(
      patch.lines.every((line) => line.kind !== ("removed" as never)),
    ).toBe(true);
  });

  it("falls back to a scaffold rather than anchoring into an unparseable file", () => {
    const patch = buildPatch(
      blocks,
      snapshot({ ".github/workflows/ci.yml": "{{{ broken" }),
    )!;
    expect(patch.mode).toBe("create");
  });
});

describe("buildPatch - no CI file", () => {
  it("proposes a whole new workflow", () => {
    const patch = buildPatch(blocks, snapshot({ "pom.xml": "<project/>" }))!;
    expect(patch.mode).toBe("create");
    expect(patch.path).toBe(".github/workflows/ci.yml");
    expect(patch.lines.every((line) => line.kind === "added")).toBe(true);
  });

  it("emits a scaffold that parses and carries the job", () => {
    const parsed = parseYaml(scaffold(blocks));
    expect(Object.keys(parsed.jobs)).toEqual(["ci-base-checks"]);
    expect(parsed.on).toHaveProperty("pull_request");
  });

  it("grants the OIDC permission the reusable workflow needs", () => {
    const parsed = parseYaml(scaffold(blocks));
    expect(parsed.permissions["id-token"]).toBe("write");
    expect(parsed.permissions.contents).toBe("read");
  });

  it("returns nothing when there is no fix to propose", () => {
    expect(buildPatch([], snapshot({ "pom.xml": "<project/>" }))).toBeNull();
  });
});
