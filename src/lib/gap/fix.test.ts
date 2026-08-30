import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import catalogueData from "@/data/catalogue.json";
import type { Catalogue } from "@/lib/catalogue/schema";
import { jobIdFor, planFixes, tailorArgs } from "./fix";
import type { RepoSnapshot } from "./types";

const catalogue = catalogueData as unknown as Catalogue;

function snapshot(
  paths: string[],
  files: Record<string, string> = {},
): RepoSnapshot {
  return {
    ref: { owner: "korzainc", repo: "example" },
    defaultBranch: "main",
    paths,
    files,
  };
}

const javaGaps = [
  "secrets",
  "sast",
  "sca",
  "iac-config",
  "lint-bugs",
  "unit-tests",
];

describe("planFixes", () => {
  it("coalesces every bundle-covered gap into one block", () => {
    const plan = planFixes(
      javaGaps,
      ["java"],
      snapshot(["pom.xml"]),
      catalogue,
    );
    const bundle = plan.blocks.filter((b) => b.entryId === "ci-base-checks");
    expect(bundle).toHaveLength(1);
    expect(bundle[0].capabilities.sort()).toEqual([
      "iac-config",
      "sast",
      "sca",
      "secrets",
    ]);
  });

  it("reports gaps with no wiring instead of inventing a step", () => {
    const plan = planFixes(
      javaGaps,
      ["java"],
      snapshot(["pom.xml"]),
      catalogue,
    );
    const unwired = plan.unwired.map((u) => u.capability).sort();
    expect(unwired).toEqual(["lint-bugs", "unit-tests"]);
    expect(plan.blocks.map((b) => b.entryId)).not.toContain("spotbugs");
  });

  it("names the candidates it could not wire, so the UI can say why", () => {
    const plan = planFixes(
      ["unit-tests"],
      ["java"],
      snapshot(["pom.xml"]),
      catalogue,
    );
    expect(plan.unwired[0].candidates).toContain("junit");
  });

  it("emits YAML that parses, under a jobs: key", () => {
    const plan = planFixes(
      javaGaps,
      ["java"],
      snapshot(["pom.xml"]),
      catalogue,
    );
    const parsed = parseYaml(
      `jobs:\n${plan.blocks[0].yaml
        .split("\n")
        .map((l) => `  ${l}`)
        .join("\n")}`,
    );
    expect(Object.keys(parsed.jobs)).toEqual(["ci-base-checks"]);
  });

  it("pins the action ref exactly as the catalogue states it", () => {
    const plan = planFixes(["sca"], ["java"], snapshot(["pom.xml"]), catalogue);
    const action = catalogue.bundles["ci-base-checks"].invocation!.github as {
      action: string;
    };
    expect(plan.blocks[0].yaml).toContain(`uses: ${action.action}`);
  });

  it("preserves GitHub expressions byte for byte", () => {
    const plan = planFixes(["sca"], ["java"], snapshot(["pom.xml"]), catalogue);
    expect(plan.blocks[0].yaml).toContain(
      "${{ vars.CI_COMMON_AZURE_CLIENT_ID }}",
    );
    const parsed = parseYaml(
      `jobs:\n${plan.blocks[0].yaml
        .split("\n")
        .map((l) => `  ${l}`)
        .join("\n")}`,
    );
    expect(parsed.jobs["ci-base-checks"].with.azure_client_id).toBe(
      "${{ vars.CI_COMMON_AZURE_CLIENT_ID }}",
    );
  });

  it("surfaces the repo vars the user has to create first", () => {
    const plan = planFixes(["sca"], ["java"], snapshot(["pom.xml"]), catalogue);
    expect(plan.blocks[0].prerequisites).toEqual([
      "CI_COMMON_AZURE_CLIENT_ID",
      "CI_COMMON_AZURE_SUBSCRIPTION_ID",
      "CI_COMMON_AZURE_TENANT_ID",
    ]);
  });

  it("carries each argument's note into the YAML", () => {
    const plan = planFixes(["sca"], ["java"], snapshot(["pom.xml"]), catalogue);
    expect(plan.blocks[0].yaml).toContain(
      "# Which Azure AD tenant that app lives in.",
    );
  });

  it("emits nothing at all for an ecosystem with no baseline", () => {
    const plan = planFixes(
      ["lint-style"],
      ["javascript"],
      snapshot(["package.json"]),
      catalogue,
    );
    expect(plan.blocks).toEqual([]);
    expect(plan.unwired).toEqual([
      { capability: "lint-style", candidates: [] },
    ]);
  });
});

describe("tailorArgs", () => {
  const args = {
    dockerfile_path: { value: "", note: "n" },
    dockerfile_context: { value: ".", note: "n" },
    sca_ignore_file: { value: "", note: "n" },
  };

  it("leaves the Dockerfile args empty when the repo has none", () => {
    const out = tailorArgs(args, snapshot(["pom.xml"]));
    expect(out.dockerfile_path.value).toBe("");
  });

  it("points at a real Dockerfile and its build context", () => {
    const out = tailorArgs(args, snapshot(["services/api/Dockerfile"]));
    expect(out.dockerfile_path.value).toBe("services/api/Dockerfile");
    expect(out.dockerfile_context.value).toBe("services/api");
  });

  it("points suppression args at an ignore file the repo actually has", () => {
    const out = tailorArgs(args, snapshot([".trivyignore"]));
    expect(out.sca_ignore_file.value).toBe(".trivyignore");
  });

  it("never invents an argument the invocation did not declare", () => {
    const out = tailorArgs(
      { sca_ignore_file: { value: "", note: "n" } },
      snapshot(["Dockerfile"]),
    );
    expect(out).not.toHaveProperty("dockerfile_path");
  });
});

describe("jobIdFor", () => {
  it("avoids colliding with a job the file already has", () => {
    expect(jobIdFor("ci-base-checks", ["ci-base-checks"])).toBe(
      "ci-base-checks-2",
    );
    expect(
      jobIdFor("ci-base-checks", ["ci-base-checks", "ci-base-checks-2"]),
    ).toBe("ci-base-checks-3");
  });
});
