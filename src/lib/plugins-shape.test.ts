import { describe, expect, it } from "vitest";
import indexData from "@/data/index.json";
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
  pinned: false,
  sha: null,
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
    "pinned",
    "sha",
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

// `generateStaticParams` returns the id and the card links to it, so a bad one breaks a route
// rather than looking odd.
describe("an id that is also a URL segment", () => {
  it.each([
    "code zen",
    "codezen/../secret",
    "Codezen",
    "-codezen",
    "code%20zen",
  ])("is rejected when id is %j", (badId) => {
    expect(problemsWithPlugin({ ...valid, id: badId }).join(" ")).toContain(
      "URL segment",
    );
  });
});

// installCommands filters on these exact names; the existing cross-check in skills.test.ts
// iterates over skills, so it never sees a plugin that ships none.
describe("agent names", () => {
  it.each([["Claude code"], ["claude-code"], ["Codex"], ["Claude Code CLI"]])(
    "is rejected when agents contains %j",
    (agent) => {
      expect(
        problemsWithPlugin({ ...valid, agents: [agent] }).join(" "),
      ).toContain("no install command");
    },
  );

  it("accepts the names install commands are rendered for", () => {
    expect(
      problemsWithPlugin({ ...valid, agents: ["Claude Code", "Codex CLI"] }),
    ).toEqual([]);
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

  it("is rejected when a row disagrees with its skills about ref", () => {
    const rows = [
      {
        plugin: "codezen",
        ref: "v1.0.0",
        sourceRepo: "korzainc/codezen",
        origin: "Korza",
        pinned: false,
      },
    ];
    expect(problemsWithPluginSet([valid], rows).join(" ")).toContain("ref");
  });

  it("is rejected when a row disagrees with its skills about origin", () => {
    const rows = [
      {
        plugin: "codezen",
        ref: "main",
        sourceRepo: "korzainc/codezen",
        origin: "Third party",
        pinned: false,
      },
    ];
    expect(problemsWithPluginSet([valid], rows).join(" ")).toContain("origin");
  });

  it("is rejected when a row disagrees with its skills about sourceRepo", () => {
    const rows = [
      {
        plugin: "codezen",
        ref: "main",
        sourceRepo: "someone/else",
        origin: "Korza",
        pinned: false,
      },
    ];
    expect(problemsWithPluginSet([valid], rows).join(" ")).toContain(
      "sourceRepo",
    );
  });

  // An entry whose payload is a language server rather than skills is legitimate, so an empty
  // plugin is not a fault. No committed entry is one today; the rule outlives the example.
  it("accepts a plugin that ships no skills at all", () => {
    expect(problemsWithPluginSet([valid], [])).toEqual([]);
  });
});

describe("the committed catalogue data", () => {
  // Both blocks arrive in the same generated file, so they cannot be a version apart.
  const plugins = indexData.plugins as Record<string, unknown>[];
  const skills = indexData.skills as {
    plugin: string;
    ref: string;
    sourceRepo: string;
    origin: string;
    pinned: boolean;
  }[];

  it("has a well shaped row for every plugin", () => {
    for (const plugin of plugins) {
      expect(problemsWithPlugin(plugin), `${plugin.id}`).toEqual([]);
    }
  });

  it("is internally consistent across the plugin rows and the skill rows", () => {
    expect(problemsWithPluginSet(plugins, skills)).toEqual([]);
  });

  // Nothing reads `versions`, so a row left behind for a delisted plugin is invisible: it neither
  // renders nor fails a shape check. The audience overlay has the same hazard and its own test.
  it("carries a version row for each plugin and no others", () => {
    const listed = plugins.map((plugin) => plugin.id).sort();
    expect(Object.keys(indexData.versions).sort()).toEqual(listed);
  });
});

describe("the pin fields", () => {
  // `as PluginEntry[]` in catalogue.ts used to reject a malformed row by accident, because the
  // rows carried fields the type did not. Declaring them made it a legal downcast, so these are
  // the only checks standing between a bad row and the page.
  it.each([["true"], [1], [null], [undefined]])(
    "rejects pinned %j, which is not a boolean",
    (pinned) => {
      expect(problemsWithPlugin({ ...valid, pinned }).join(" ")).toContain(
        "pinned",
      );
    },
  );

  it("accepts a null sha, which is how an unpinned entry reports it", () => {
    expect(problemsWithPlugin({ ...valid, sha: null })).toEqual([]);
  });

  it("accepts a sha-pinned entry", () => {
    expect(
      problemsWithPlugin({ ...valid, sha: "a".repeat(40), pinned: true }),
    ).toEqual([]);
  });

  it.each([[""], ["   "], [7]])("rejects sha %j", (sha) => {
    expect(problemsWithPlugin({ ...valid, sha }).join(" ")).toContain("sha");
  });

  // The home page reads `skill.pinned` for its provenance line, so the two sides disagreeing
  // renders "From obra/superpowers" where it should say "Pinned to v6.2.0".
  it("is rejected when a row disagrees with its skills about pinned", () => {
    const rows = [
      {
        plugin: "codezen",
        ref: "main",
        sourceRepo: "korzainc/codezen",
        origin: "Korza",
        pinned: true,
      },
    ];
    expect(problemsWithPluginSet([valid], rows).join(" ")).toContain("pinned");
  });
});
