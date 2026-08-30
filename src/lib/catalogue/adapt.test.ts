import { describe, expect, it } from "vitest";
import catalogueData from "@/data/catalogue.json";
import type { Catalogue } from "./schema";
import {
  entries,
  invocationFor,
  preferredFor,
  toAnalysisTools,
  toBaseline,
} from "./adapt";

const catalogue = catalogueData as unknown as Catalogue;

describe("adapt", () => {
  it("folds bundles in alongside tools", () => {
    const ids = entries(catalogue).map((entry) => entry.id);
    expect(ids).toContain("eslint");
    expect(ids).toContain("ci-base-checks");
  });

  it("translates the artifact's `*` language into the engine's `any`", () => {
    const bundle = toAnalysisTools(catalogue).find(
      (t) => t.id === "ci-base-checks",
    );
    expect(bundle?.stacks).toEqual(["any"]);
  });

  it("flattens vendor-keyed detection onto one signal set", () => {
    const eslint = toAnalysisTools(catalogue).find((t) => t.id === "eslint");
    expect(eslint?.detect.commands).toContain("eslint");
    expect(eslint?.detect.manifestDeps).toContain("eslint");
  });

  it("reads a bundle's single invocation for any capability it covers", () => {
    const bundle = catalogue.bundles["ci-base-checks"];
    expect(invocationFor(bundle, "sca")?.action).toContain("ci.yml@");
    expect(invocationFor(bundle, "secrets")?.action).toContain("ci.yml@");
  });

  it("returns nothing for a capability a bundle does not cover", () => {
    expect(
      invocationFor(catalogue.bundles["ci-base-checks"], "unit-tests"),
    ).toBeNull();
  });

  it("reads a tool's per-capability invocation", () => {
    expect(invocationFor(catalogue.tools.semgrep, "sast")?.action).toContain(
      "security-sast.yml@",
    );
  });

  it("returns nothing for a tool with no invocation at all", () => {
    expect(invocationFor(catalogue.tools.eslint, "lint-style")).toBeNull();
  });

  it("keeps only required capabilities as gaps", () => {
    const java = toBaseline(catalogue).stacks.find((s) => s.id === "java");
    expect(Object.keys(java?.expects ?? {})).toContain("sast");
    // coverage is `required: false` in the java baseline - advisory, not a gap.
    expect(Object.keys(java?.expects ?? {})).not.toContain("coverage");
  });

  it("maps capability categories through the taxonomy labels", () => {
    expect(toBaseline(catalogue).capabilities.sast.category).toBe("Security");
  });

  it("ranks recommended ahead of acceptable", () => {
    expect(preferredFor(catalogue, "java", "sast")).toEqual([
      "ci-base-checks",
      "codeql",
    ]);
  });
});
