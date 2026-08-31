import { describe, expect, it } from "vitest";
import { baseline, bundles, tools, visibleTools } from "./catalogue";

// The engine is only as good as the data behind it, and the failures are quiet: a capability with
// no tool renders as a gap nobody can act on, and a typo in a capability id renders as nothing at
// all. These assertions are the reason those show up as a red test rather than a bad report.
describe("catalogue and baseline agree", () => {
  it("has no duplicate tool ids", () => {
    const ids = tools.map((tool) => tool.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every tool at least one way to be detected", () => {
    for (const tool of tools) {
      const signals = [
        tool.detect.ciUses,
        tool.detect.commands,
        tool.detect.configFiles,
        tool.detect.manifestDeps,
      ].flatMap((signal) => signal ?? []);

      expect(signals, `${tool.id} has no detection signals`).not.toHaveLength(
        0,
      );
    }
  });

  it("only uses capability ids the baseline defines", () => {
    for (const tool of tools) {
      for (const capability of tool.capabilities) {
        expect(
          baseline.capabilities[capability],
          `${tool.id} claims unknown capability ${capability}`,
        ).toBeDefined();
      }
    }
  });

  it("only uses stack ids the baseline defines", () => {
    const known = new Set([...baseline.stacks.map((stack) => stack.id), "any"]);

    for (const tool of tools) {
      for (const stack of tool.stacks) {
        expect(
          known.has(stack),
          `${tool.id} claims unknown stack ${stack}`,
        ).toBe(true);
      }
    }
  });

  it("expects only capabilities the baseline defines", () => {
    const expected = [
      ...baseline.universal,
      ...baseline.stacks.flatMap((stack) => Object.keys(stack.expects)),
    ];

    for (const capability of expected) {
      expect(
        baseline.capabilities[capability],
        `baseline expects unknown capability ${capability}`,
      ).toBeDefined();
    }
  });

  it("puts every capability in a category the report knows how to order", () => {
    for (const [id, capability] of Object.entries(baseline.capabilities)) {
      expect(
        baseline.categories,
        `${id} is in category ${capability.category}`,
      ).toContain(capability.category);
    }
  });

  it("offers a tool for everything a stack is expected to have", () => {
    for (const stack of baseline.stacks) {
      for (const capability of Object.keys(stack.expects)) {
        const candidates = tools.filter(
          (tool) =>
            tool.capabilities.includes(capability) &&
            (tool.stacks.includes("any") || tool.stacks.includes(stack.id)),
        );

        expect(
          candidates.length,
          `${stack.id} expects ${capability} and no tool provides it`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("gives every stack's recommended/acceptable tool ids a real, capability-matching tool", () => {
    const toolIds = new Set(tools.map((tool) => tool.id));
    for (const stack of baseline.stacks) {
      for (const [capability, entry] of Object.entries(stack.expects)) {
        for (const toolId of [entry.recommended, ...entry.acceptable]) {
          expect(
            toolIds.has(toolId),
            `${stack.id}'s ${capability} names ${toolId}, not a real tool id`,
          ).toBe(true);
          const tool = tools.find((candidate) => candidate.id === toolId);
          expect(
            tool?.capabilities.includes(capability),
            `${toolId} doesn't actually provide ${capability}`,
          ).toBe(true);
        }
      }
    }
  });

  // No "stack-agnostic tool for every universal capability" test: baseline.universal is
  // always [] (see flattenBaseline in catalogue.ts), so that assertion would loop over
  // nothing and pass without testing anything.

  it("gives every tool and bundle a non-empty problem and 1-3 benefits", () => {
    // Every tool/bundle gets a detail page rendering `problem` and `benefits` unconditionally.
    // catalogue.ts falls back to ""/[] rather than crashing, so a missing one would only render
    // a blank section; this test turns that into a build failure.
    for (const tool of [...tools, ...bundles]) {
      expect(tool.problem, `${tool.id} has no problem statement`).not.toBe("");
      expect(
        tool.benefits.length,
        `${tool.id} has ${tool.benefits.length} benefits`,
      ).toBeGreaterThan(0);
      expect(
        tool.benefits.length,
        `${tool.id} has ${tool.benefits.length} benefits`,
      ).toBeLessThanOrEqual(3);
    }
  });

  it("ci-base-checks wraps exactly the four real tools with our real capability ids", () => {
    const ciBaseChecks = bundles.find(
      (bundle) => bundle.id === "ci-base-checks",
    );
    expect(ciBaseChecks?.wraps.map((entry) => entry.tool).sort()).toEqual([
      "hadolint",
      "kingfisher",
      "semgrep",
      "trivy",
    ]);
    expect(ciBaseChecks?.capabilities.sort()).toEqual(
      [
        "secrets",
        "sast",
        "sca",
        "iac-config",
        "image-scan",
        "iac-dockerfile-lint",
      ].sort(),
    );
  });

  it("categorizes a tool/bundle by its majority capability category, not its first", () => {
    // ci-base-checks is the case that matters: 5 of its 6 capabilities are security, 1 is
    // quality, so picking capabilities[0] would land on the right answer only by accident.
    const ciBaseChecks = bundles.find(
      (bundle) => bundle.id === "ci-base-checks",
    );
    expect(ciBaseChecks?.category).toBe("Security");

    // eslint is single-category (lint-style only): a sanity check that the common case still
    // resolves correctly, not just the majority-vote edge case above.
    const eslint = tools.find((tool) => tool.id === "eslint");
    expect(eslint?.category).toBe("Code Quality");
  });
});

describe("flattenBaseline", () => {
  it("has no universal capability - the real schema has no such bucket", () => {
    expect(baseline.universal).toEqual([]);
  });

  it("includes every real ecosystem, none dropped", () => {
    const ids = baseline.stacks.map((stack) => stack.id).sort();
    expect(ids).toEqual(
      ["docker", "go", "java", "javascript", "python", "typescript"].sort(),
    );
  });

  it("labels ecosystems from the pinned map, not title-casing", () => {
    // "typescript" is exactly the case title-casing gets wrong, which is why the label map
    // is pinned rather than derived.
    const typescript = baseline.stacks.find(
      (stack) => stack.id === "typescript",
    );
    expect(typescript?.label).toBe("TypeScript");
  });
});

describe("visibleTools", () => {
  it("excludes every wrapped tool while keeping every non-wrapped one", () => {
    const wrappedIds = new Set(
      bundles.flatMap((bundle) => bundle.wraps.map((entry) => entry.tool)),
    );
    for (const tool of visibleTools) {
      expect(wrappedIds.has(tool.id)).toBe(false);
    }
    // eslint/spotbugs are real catalogue tools too, just not wrapped by any bundle: confirms
    // the filter removes only the wrapped ids.
    const ids = visibleTools.map((tool) => tool.id);
    expect(ids).toEqual(expect.arrayContaining(["eslint", "spotbugs"]));
  });

  it("includes every bundle", () => {
    const visibleIds = new Set(visibleTools.map((tool) => tool.id));
    for (const bundle of bundles) {
      expect(visibleIds.has(bundle.id)).toBe(true);
    }
  });
});

describe("bundles", () => {
  it("gives every bundle a capabilities list matching the union of what it wraps", () => {
    for (const bundle of bundles) {
      const wrappedCapabilities = new Set(
        bundle.wraps.flatMap((entry) => entry.capabilities),
      );
      expect(new Set(bundle.capabilities)).toEqual(wrappedCapabilities);
    }
  });
});
