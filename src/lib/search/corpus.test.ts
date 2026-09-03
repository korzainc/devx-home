import { describe, expect, it } from "vitest";
import {
  browsableSkills,
  bundles,
  plugins,
  toolchainSkills,
  tools,
  visibleTools,
} from "@/lib/catalogue";
import { searchCorpus } from "@/lib/search/corpus";
import { taskOf } from "@/lib/search/semantic";

const corpus = searchCorpus();

describe("searchCorpus", () => {
  it("indexes every skill the catalogue lists, browsable or not", () => {
    // Regression: indexing only `browsableSkills` dropped the nine setup and meta skills, so a
    // search for documentation could not reach `writing-for-agents`. The catalogue page's rule is
    // that those rows are searchable but never faceted.
    const skills = corpus.filter((doc) => doc.kind === "skill");
    expect(skills).toHaveLength(
      browsableSkills.length + toolchainSkills.length,
    );
    expect(skills.map((doc) => doc.name)).toContain("writing-for-agents");
  });

  it("indexes every tool and plugin", () => {
    expect(corpus.filter((doc) => doc.kind === "tool")).toHaveLength(
      tools.length,
    );
    expect(corpus.filter((doc) => doc.kind === "plugin")).toHaveLength(
      plugins.length,
    );
  });

  it("indexes the tools a bundle hides from the /tools grid", () => {
    // `visibleTools` drops a wrapped tool because the bundle's card covers it, but /tools/[id]
    // still builds that tool a page - so searching its name has somewhere to land, and answering
    // with the bundle instead would be answering a different question.
    expect(tools.length).toBeGreaterThan(visibleTools.length);
    const wrapped = bundles.flatMap((bundle) =>
      bundle.wraps.map((entry) => entry.tool),
    );
    for (const id of wrapped) {
      expect(
        corpus.some((doc) => doc.key === `tool:${id}`),
        id,
      ).toBe(true);
    }
  });

  it("links a tool to its own detail page", () => {
    const tool = corpus.find((doc) => doc.kind === "tool");
    expect(tool?.href).toBe(`/tools/${tool?.id}`);
  });

  it("indexes a tool's problem and benefits prose", () => {
    // The reason tool results rank at all: the real artifact carries two paragraphs of what a
    // tool is for, where the placeholder rows this replaced had a name and one line.
    const withProse = tools.find((tool) => tool.problem);
    const doc = corpus.find((entry) => entry.key === `tool:${withProse?.id}`);
    expect(doc?.text).toContain(withProse?.problem);
  });

  it("labels a bundle as one rather than by category", () => {
    const bundle = bundles[0];
    const doc = corpus.find((entry) => entry.key === `tool:${bundle.id}`);
    expect(doc?.context).toBe("bundle");
  });

  it("excludes planned skills, which are not installable", () => {
    expect(corpus.some((doc) => doc.name === "brd")).toBe(false);
  });

  it("gives every document a unique key across the corpora", () => {
    // A skill id and a tool id share no namespace, so the kind has to be part of the key.
    const keys = corpus.map((doc) => doc.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every document text to match on and somewhere to go", () => {
    for (const doc of corpus) {
      expect(doc.text.trim(), doc.key).not.toBe("");
      expect(doc.href, doc.key).toMatch(/^\//);
      expect(doc.name, doc.key).not.toBe("");
    }
  });

  it("puts a skill's jobs in its text, which is what a typed phrase matches", () => {
    const review = corpus.find((doc) => doc.name === "code-review");
    expect(review?.text).toMatch(/review/i);
  });

  it("keeps a plugin's aggregate prose out of its text", () => {
    // A plugin's `problem` and `benefits` describe all of its skills, so indexing them made one
    // document mildly about everything and floated plugins above real answers.
    const plugin = plugins[0];
    const doc = corpus.find((entry) => entry.key === `plugin:${plugin.id}`);
    expect(doc?.text).not.toContain(plugin.problem);
  });

  it("links a skill where its card links", () => {
    const skill = browsableSkills[0];
    const doc = corpus.find((entry) => entry.key === `skill:${skill.id}`);
    expect(doc?.href).toBe(`/skills/${skill.plugin}#${skill.name}`);
  });
});

describe("taskOf", () => {
  it("strips a request frame so the embedding sees the task", () => {
    expect(taskOf("I want a skill for documentation")).toBe("documentation");
    expect(taskOf("I need a tool for scanning secrets")).toBe(
      "scanning secrets",
    );
    expect(taskOf("how do I write tests")).toBe("write tests");
    expect(taskOf("show me something that reviews PRs")).toBe("reviews PRs");
  });

  it("leaves a query that is already a task alone", () => {
    expect(taskOf("review a pull request")).toBe("review a pull request");
    expect(taskOf("eslint")).toBe("eslint");
  });

  it("keeps the original when the frame is the whole query", () => {
    // Otherwise the embedding is handed an empty string.
    expect(taskOf("how to")).toBe("how to");
    expect(taskOf("I want")).toBe("I want");
  });
});
