import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { analyze } from "./analyze";
import { filesToRead } from "./detect";
import { buildFixPrompt, type PlacementNotes } from "./prompt";
import type { RepoSnapshot } from "./types";
import { getBaseline, tools } from "@/lib/catalogue";

const fixturesRoot = path.resolve(
  import.meta.dirname,
  "../../../docs/superpowers/scratch/dx198-fixtures",
);

const excludedDirs = new Set([".git", "node_modules"]);

/** Walks a directory into a RepoSnapshot the same way a real repo read would produce one:
 * `paths` is everything tracked, `files` is restricted to what the portal would actually read
 * (`filesToRead`), matching what `filesRead` reports downstream - not every byte on disk. */
function loadSnapshotFromDisk(root: string, repoLabel: string): RepoSnapshot {
  const paths: string[] = [];

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (excludedDirs.has(entry.name)) continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs);
      if (entry.isDirectory()) walk(abs);
      else paths.push(rel);
    }
  }
  walk(root);

  const baseline = getBaseline();
  const files: Record<string, string> = {};
  for (const rel of filesToRead(paths, baseline)) {
    files[rel] = fs.readFileSync(path.join(root, rel), "utf8");
  }

  return {
    ref: { provider: "github", owner: "scratch", repo: repoLabel },
    defaultBranch: "main",
    paths,
    files,
  };
}

const catalogue = { tools, baseline: getBaseline() };

// Disclosure, not a bug: nothing in detect.ts reads workflow content for image-scan (its only
// signal is the Dockerfile marker), so fixtures A and B analyze identically today. The
// found/not-found contrast below comes entirely from the hand-typed notes, not from anything the
// fixture files themselves cause the real detector to see.
describe("DX-198 ordering demo (scratch, delete after review)", () => {
  test("fixture A - builds an image", () => {
    const analysis = analyze(
      loadSnapshotFromDisk(
        path.join(fixturesRoot, "a-builds-image"),
        "a-builds-image",
      ),
      catalogue,
    );
    const notes: PlacementNotes = {
      "image-scan": {
        needs: "a built container image to scan",
        candidate: "`docker build` in `.github/workflows/ci.yml`, job `build`",
      },
    };
    console.log("\n=== FIXTURE A: TODAY ===\n" + buildFixPrompt(analysis));
    console.log(
      "\n=== FIXTURE A: WITH PLACEMENT NOTES ===\n" +
        buildFixPrompt(analysis, notes),
    );
    expect(analysis.repo).toBe("scratch/a-builds-image");
  });

  test("fixture B - Dockerfile present, no build step", () => {
    const analysis = analyze(
      loadSnapshotFromDisk(
        path.join(fixturesRoot, "b-dockerfile-no-build"),
        "b-dockerfile-no-build",
      ),
      catalogue,
    );
    const notes: PlacementNotes = {
      "image-scan": { needs: "a built container image to scan", candidate: null },
    };
    console.log("\n=== FIXTURE B: TODAY ===\n" + buildFixPrompt(analysis));
    console.log(
      "\n=== FIXTURE B: WITH PLACEMENT NOTES ===\n" +
        buildFixPrompt(analysis, notes),
    );
    expect(analysis.repo).toBe("scratch/b-dockerfile-no-build");
  });

  test("fixture C - no container, notes omitted, no new section", () => {
    const analysis = analyze(
      loadSnapshotFromDisk(
        path.join(fixturesRoot, "c-no-container"),
        "c-no-container",
      ),
      catalogue,
    );
    const output = buildFixPrompt(analysis);
    console.log("\n=== FIXTURE C: TODAY (notes omitted) ===\n" + output);
    expect(output).not.toContain("Where these go in the pipeline");
  });

  test("fixture D - a real local repo", () => {
    // Point DX198_DEMO_REPO at a real checkout to answer "check them out in some repos we have"
    // with an actual Korza repo, not a synthetic fixture. Read the printed analysis first to see
    // its real gaps/stacks before hand-typing a note for one of them here.
    const repoRoot = process.env.DX198_DEMO_REPO;
    if (!repoRoot) {
      console.log(
        "\n=== FIXTURE D skipped: set DX198_DEMO_REPO to a real local checkout ===",
      );
      return;
    }
    const analysis = analyze(
      loadSnapshotFromDisk(repoRoot, path.basename(repoRoot)),
      catalogue,
    );
    console.log(
      `\n=== REAL REPO (${path.basename(repoRoot)}): TODAY ===\n` +
        buildFixPrompt(analysis),
    );
    // Hand-typed after reading this repo's real workflows directly: deliver.yml really does
    // build and push an image via docker/build-push-action, in job `image_admin`.
    const realNotes: PlacementNotes = {
      "image-scan": {
        needs: "a built container image to scan",
        candidate:
          "`docker/build-push-action` in `.github/workflows/deliver.yml`, job `image_admin`",
      },
    };
    console.log(
      `\n=== REAL REPO (${path.basename(repoRoot)}): WITH PLACEMENT NOTES ===\n` +
        buildFixPrompt(analysis, realNotes),
    );
  });
});
