import { describe, expect, it } from "vitest";
import skillsData from "@/data/skills.json";
import {
  baseline,
  indexSchemaVersion,
  installCommands,
  marketplaceName,
  marketplaceRepo,
  duplicateClaims,
  getPlugin,
  pluginRows,
  plugins,
  rivalPlugins,
  skills,
  skillsArePlaceholder,
  versionFacetLabel,
  versionStatusFor,
  tools,
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
      ...baseline.stacks.flatMap((stack) => stack.expects),
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
      for (const capability of stack.expects) {
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

  it("offers a stack-agnostic tool for every universal capability", () => {
    for (const capability of baseline.universal) {
      const candidates = tools.filter(
        (tool) =>
          tool.capabilities.includes(capability) && tool.stacks.includes("any"),
      );

      expect(
        candidates.length,
        `universal capability ${capability} has no stack-agnostic tool`,
      ).toBeGreaterThan(0);
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
