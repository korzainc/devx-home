import { describe, expect, it } from "vitest";
import { baseline, tools } from "./catalogue";

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
    // A repo with no recognised manifest can only be recommended `any` tools, so a universal
    // capability backed solely by, say, a Java tool would leave that report with a dead end.
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
