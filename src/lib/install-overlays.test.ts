import { describe, expect, it } from "vitest";
import catalogue from "@/data/catalogue.json";
import { actionDetails } from "@/data/action-details";
import { installConfigs } from "@/data/install-configs";
import { bundles, toolInstallMethods, tools } from "./catalogue";
import { installMethods, type RawInstall } from "./install-commands";

const rawTools: Record<string, { install?: RawInstall[] }> = {
  ...catalogue.tools,
  ...catalogue.bundles,
};

/** Tools whose catalogue install is a bare docs link and nothing else. These are the ones the
 *  panel has nothing runnable to show, so they are the ones `installConfigs` speaks for. */
const docsOnly = Object.entries(rawTools)
  .filter(([, tool]) => {
    const methods = installMethods(tool.install);
    return methods.length > 0 && methods.every((m) => m.kind === "docs");
  })
  .map(([id]) => id);

describe("the install panel's view of the catalogue", () => {
  it("never shows a docs link the Docs row on the same page already carries", () => {
    for (const tool of tools) {
      for (const method of toolInstallMethods(tool.id)) {
        expect(
          method.kind,
          `${tool.id} still offers "${method.label}" as a docs link`,
        ).not.toBe("docs");
      }
    }
  });

  it("renders no panel for a check that ships with its toolchain", () => {
    // go-test's only entry is the Go download page. An empty panel captioned "no install" would
    // be worse than none, so `ToolInstall` renders nothing when this is empty.
    expect(toolInstallMethods("go-test")).toEqual([]);
  });

  it("returns nothing for an id the catalogue does not have", () => {
    expect(toolInstallMethods("not-a-real-tool")).toEqual([]);
  });

  it("does not build a panel out of Object.prototype", () => {
    // The id is a route segment. Plain indexing turned "constructor" into a method with no
    // label and no command, rendered as an empty box.
    for (const id of [
      "constructor",
      "toString",
      "__proto__",
      "hasOwnProperty",
    ]) {
      expect(toolInstallMethods(id), `${id} produced a panel`).toEqual([]);
    }
  });

  it("does not tell a bundle that its own image already bundles the check", () => {
    // Circular on the bundle's own page: that page is the image. Still worth saying on the pages
    // of the tools it wraps, which is the next assertion.
    for (const bundle of bundles) {
      for (const method of toolInstallMethods(bundle.id)) {
        expect(
          method.note,
          `${bundle.id} explains its own image to itself`,
        ).toBeUndefined();
      }
    }
  });

  it("still points a wrapped tool at the image that already carries it", () => {
    const notes = toolInstallMethods("trivy")
      .map((method) => method.note)
      .filter(Boolean);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain("already bundles");
  });
});

// Hand-authored beside a synced catalogue, so these guard the seam: a resync that renames a
// tool or swaps an action should fail here rather than silently drop the panel's only content.
describe("install config overlay", () => {
  it("speaks for every tool whose only install entry is a docs link", () => {
    for (const id of docsOnly) {
      const covered = installConfigs[id] !== undefined;
      const methods = toolInstallMethods(id);
      expect(
        covered || methods.length === 0,
        `${id} has neither a config file nor an empty panel`,
      ).toBe(true);
    }
  });

  it("has no entry for a tool the catalogue dropped", () => {
    const known = new Set(tools.map((tool) => tool.id));
    for (const id of Object.keys(installConfigs)) {
      expect(known.has(id), `${id} is no longer in the catalogue`).toBe(true);
    }
  });

  it("names a path for every config, since the content is inert anywhere else", () => {
    for (const [id, config] of Object.entries(installConfigs)) {
      expect(config.target, `${id} has no target path`).toMatch(/\w/);
      expect(config.content.trim().length, `${id} is empty`).toBeGreaterThan(0);
    }
  });

  it("puts Dependabot's config in the panel in place of the docs link", () => {
    const methods = toolInstallMethods("dependabot");
    expect(methods).toHaveLength(1);
    expect(methods[0].target).toBe(".github/dependabot.yml");
    expect(methods[0].command).toContain("package-ecosystem");
    // github.com/apps/dependabot redirects to the docs, so the obvious guess is wrong and the
    // panel says so rather than leaving the reader hunting for an install button.
    expect(methods[0].note).toContain("no app to install");
  });
});

describe("action details overlay", () => {
  const catalogueActions = new Set(
    Object.values(rawTools).flatMap((tool) =>
      installMethods(tool.install)
        .map((method) => method.action)
        .filter((action): action is string => action !== undefined),
    ),
  );

  it("has no entry for an action the catalogue no longer uses", () => {
    for (const action of Object.keys(actionDetails)) {
      expect(
        catalogueActions.has(action),
        `${action} is not in any tool's install data`,
      ).toBe(true);
    }
  });

  it("documents every action the catalogue does use", () => {
    for (const action of catalogueActions) {
      expect(
        actionDetails[action],
        `${action} has no inputs documented; add it to action-details.ts`,
      ).toBeDefined();
    }
  });

  it("gives every input a name and a description worth reading", () => {
    for (const [action, details] of Object.entries(actionDetails)) {
      expect(
        details.inputs.length,
        `${action} lists no inputs`,
      ).toBeGreaterThan(0);
      const names = details.inputs.map((input) => input.name);
      expect(new Set(names).size, `${action} repeats an input`).toBe(
        names.length,
      );
      for (const input of details.inputs) {
        expect(input.name, `${action} has an unnamed input`).toMatch(/\w/);
        expect(
          input.description.length,
          `${action}'s ${input.name} has no real description`,
        ).toBeGreaterThan(20);
      }
    }
  });
});
