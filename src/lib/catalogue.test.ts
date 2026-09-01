import { describe, expect, it } from "vitest";
import skillsData from "@/data/skills.json";
import {
  baseline,
  bundles,
  duplicateClaims,
  getPlugin,
  indexSchemaVersion,
  installCommands,
  marketplaceName,
  marketplaceRepo,
  pluginRows,
  plugins,
  rivalPlugins,
  skills,
  skillsArePlaceholder,
  tools,
  versionFacetLabel,
  versionStatusFor,
  visibleTools,
} from "./catalogue";

// The failures are quiet: a capability with no tool renders as a gap nobody can act on.
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

  it("gives every tool and bundle a non-empty problem, 1-3 benefits, and a parseable docsUrl", () => {
    // The detail page renders `problem`/`benefits` unconditionally and parses `docsUrl` with
    // an unguarded `new URL()`. catalogue.ts falls back to ""/[] rather than crashing on the
    // first two, so a missing value would only render a blank section; a bad docsUrl fails
    // `next build` outright. This test turns all three into a build failure instead.
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
      expect(
        () => new URL(tool.docsUrl),
        `${tool.id} has an unparseable docsUrl`,
      ).not.toThrow();
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

describe("install commands", () => {
  it("offers a command only for an agent the plugin lists", () => {
    for (const plugin of plugins) {
      const commands = installCommands(plugin);
      expect(commands.map((entry) => entry.agent)).toEqual(
        ["Claude Code", "Codex CLI"].filter((agent) =>
          plugin.agents.includes(agent),
        ),
      );
      for (const command of commands) {
        expect(command.install).toContain(`${plugin.name}@${marketplaceName}`);
        expect(command.register).toContain(marketplaceRepo);
      }
    }
  });

  it("offers nothing for a plugin no agent lists", () => {
    expect(installCommands({ ...plugins[0], agents: [] })).toEqual([]);
  });
});

describe("plugin rows", () => {
  it("derives a pin state for every plugin", () => {
    // Powers the Pin facet.
    for (const plugin of pluginRows) {
      expect(plugin.pinState, plugin.id).toBe(
        versionFacetLabel(versionStatusFor(plugin.id)),
      );
      expect(plugin.pinState).not.toBe("Unknown");
    }
  });
});

describe("provenance", () => {
  // The placeholder half cannot be pinned while the data says false: a literal and the
  // derivation agree.
  it("declares the skill index as generated, at the schema the file states", () => {
    // Fails if a hand-extracted file is dropped back in.
    expect(skillsArePlaceholder).toBe(false);
    expect(indexSchemaVersion).toBe(skillsData.schemaVersion);
    expect(indexSchemaVersion).toBeGreaterThan(0);
  });
});

describe("install commands and duplicate claims", () => {
  it("names the marketplace and the plugin the user actually types", () => {
    // Text a user copies into a terminal.
    const codezen = plugins.find((p) => p.id === "codezen")!;
    const [claude, codex] = installCommands({ ...codezen, id: "not-the-name" });
    // Literals: interpolating the constants mutates both sides.
    expect(claude.install).toBe("/plugin install codezen@korza-marketplace");
    expect(claude.register).toBe(
      "/plugin marketplace add korzainc/marketplace",
    );
    expect(codex.install).toBe("codex plugin add codezen@korza-marketplace");
    expect(codex.register).toBe(
      "codex plugin marketplace add korzainc/marketplace --ref main",
    );
  });

  it("looks a plugin up by id", () => {
    expect(getPlugin("superpowers")?.id).toBe("superpowers");
    expect(getPlugin("not-a-plugin")).toBeUndefined();
  });

  it("reports a name only when more than one plugin claims it", () => {
    // `code-review` and `tdd` each ship from two plugins.
    expect([...duplicateClaims.keys()].sort()).toEqual(["code-review", "tdd"]);
    for (const [name, claimants] of duplicateClaims) {
      expect(claimants.length, name).toBeGreaterThan(1);
      expect([...claimants]).toEqual([...claimants].sort());
    }
  });

  it("lists the other plugins claiming a name, never the skill's own", () => {
    const codeReview = skills.find(
      (s) => s.name === "code-review" && s.plugin === "codezen",
    )!;
    expect(rivalPlugins(codeReview)).toEqual(["mattpocock-skills"]);
  });
});
