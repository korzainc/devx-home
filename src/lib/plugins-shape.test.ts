import { describe, expect, it } from "vitest";
import pluginsData from "@/data/plugins.json";
import skillsData from "@/data/skills.json";
import { problemsWithPlugin, problemsWithPluginSet } from "./plugins-shape";

const valid = {
  id: "codezen",
  name: "codezen",
  summary: "Skills for building software, from Korza.",
  problem: "Agent-assisted work tends to jump straight to code.",
  benefits: ["Covers requirements, build and test."],
  agents: ["Claude Code"],
  origin: "Korza",
  ref: "main",
  sourceRepo: "korzainc/codezen",
  homepage: "https://github.com/korzainc/codezen",
};

describe("a plugin row", () => {
  it("is accepted when every field is present and well shaped", () => {
    expect(problemsWithPlugin(valid)).toEqual([]);
  });

  it.each([
    "id",
    "name",
    "summary",
    "problem",
    "benefits",
    "agents",
    "origin",
    "ref",
    "sourceRepo",
    "homepage",
  ])("is rejected without %s", (field) => {
    const { [field]: _dropped, ...rest } = valid as Record<string, unknown>;
    expect(problemsWithPlugin(rest).join(" ")).toContain(field);
  });

  it.each(["", "   "])("is rejected when summary is %j", (summary) => {
    expect(problemsWithPlugin({ ...valid, summary }).join(" ")).toContain(
      "summary",
    );
  });

  it.each([[[]], [[""]]])(
    "is rejected when benefits is %j, which renders an empty section",
    (benefits) => {
      expect(problemsWithPlugin({ ...valid, benefits }).join(" ")).toContain(
        "benefits",
      );
    },
  );

  // `name` is interpolated into the install command a user pastes into a terminal.
  it.each([
    "code zen",
    "codezen; rm -rf ~",
    "code`whoami`",
    "$(id)",
    "-codezen",
    "Codezen",
    "codezen@korza-marketplace",
  ])("is rejected when name is %j, which reaches a shell", (name) => {
    expect(problemsWithPlugin({ ...valid, name }).join(" ")).toContain("name");
  });

  // `homepage` becomes an href.
  it.each([
    "javascript:alert(1)",
    "http://github.com/korzainc/codezen",
    "/korzainc/codezen",
    "github.com/korzainc/codezen",
    "",
  ])("is rejected when homepage is %j", (homepage) => {
    expect(problemsWithPlugin({ ...valid, homepage }).join(" ")).toContain(
      "homepage",
    );
  });
});

describe("an optional payload", () => {
  it("is accepted when absent", () => {
    expect(problemsWithPlugin(valid)).toEqual([]);
  });

  it("is accepted when it says what the entry ships", () => {
    expect(
      problemsWithPlugin({ ...valid, payload: "1 language server" }),
    ).toEqual([]);
  });

  // The card renders it in place of the skill count, so a blank one shows nothing at all.
  it.each(["", "   "])("is rejected when present but %j", (payload) => {
    expect(problemsWithPlugin({ ...valid, payload }).join(" ")).toContain(
      "payload",
    );
  });
});

describe("the plugin set", () => {
  const other = { ...valid, id: "humanizer", name: "humanizer" };

  it("is accepted when ids and names are distinct", () => {
    expect(problemsWithPluginSet([valid, other], [])).toEqual([]);
  });

  it.each(["id", "name"])("is rejected when two rows share a %s", (field) => {
    const clash = { ...other, [field]: valid[field as keyof typeof valid] };
    expect(problemsWithPluginSet([valid, clash], []).join(" ")).toContain(
      field,
    );
  });

  // skills.json is generated from the manifests and plugins.json is hand-authored, so a re-pin
  // upstream moves one and leaves the other. This is the direction skills.test.ts does not cover.
  it("is rejected when a row disagrees with its skills about ref", () => {
    const rows = [
      { plugin: "codezen", ref: "v1.0.0", sourceRepo: "korzainc/codezen" },
    ];
    expect(problemsWithPluginSet([valid], rows).join(" ")).toContain("ref");
  });

  it("is rejected when a row disagrees with its skills about sourceRepo", () => {
    const rows = [
      { plugin: "codezen", ref: "main", sourceRepo: "someone/else" },
    ];
    expect(problemsWithPluginSet([valid], rows).join(" ")).toContain(
      "sourceRepo",
    );
  });

  // pyright-lsp ships nothing and is still a legitimate entry, so an empty plugin is not a fault.
  it("accepts a plugin that ships no skills at all", () => {
    expect(problemsWithPluginSet([valid], [])).toEqual([]);
  });
});

describe("the committed catalogue data", () => {
  // plugins.json is a bare array; skills.json is an object with a `skills` key.
  const plugins = pluginsData as Record<string, unknown>[];
  const skills = skillsData.skills as {
    plugin: string;
    ref: string;
    sourceRepo: string;
  }[];

  it("has a well shaped row for every plugin", () => {
    for (const plugin of plugins) {
      expect(problemsWithPlugin(plugin), `${plugin.id}`).toEqual([]);
    }
  });

  it("is internally consistent across plugins.json and skills.json", () => {
    expect(problemsWithPluginSet(plugins, skills)).toEqual([]);
  });
});
