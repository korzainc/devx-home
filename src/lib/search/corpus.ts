import {
  browsableSkills,
  isBundle,
  plugins,
  toolchainSkills,
  tools,
  type PluginEntry,
  type SkillEntry,
  type ToolEntry,
} from "@/lib/catalogue";

/**
 * The one place the search index learns what there is to search.
 *
 * Tools come from the real `catalogue.json` artifact, which #31 wired into `catalogue.ts`. This
 * adapter is why that migration was a change to one function plus an index rebuild rather than a
 * change to the builder, the ranker and the route as well - keep it that way.
 */

/** What a result needs to render, plus the prose the embedding is taken from. */
export type SearchDoc = {
  /** Unique across corpora: a skill id and a tool id could otherwise collide. */
  key: string;
  kind: SearchKind;
  /** `id` within its own corpus, for linking. */
  id: string;
  name: string;
  /** One line under the name in a result row. */
  blurb: string;
  href: string;
  /** Shown on a tool row where a skill row shows its plugin. */
  context: string;
  /** Everything the embedding and the lexical index see. Never rendered. */
  text: string;
};

export type SearchKind = "skill" | "tool" | "plugin";

/**
 * Skills carry `jobs`: phrases a user might actually type. They embed better than the summary.
 *
 * Both lists, because the catalogue page's own rule is that setup and meta skills are "listed and
 * searchable, but outside every facet" - search reaches them, filters do not. Indexing only
 * `browsableSkills` dropped nine of them, `writing-for-agents` among them, which is the skill a
 * search for documentation should find first.
 */
function skillDocs(): SearchDoc[] {
  return [...browsableSkills, ...toolchainSkills].map((skill: SkillEntry) => ({
    key: `skill:${skill.id}`,
    kind: "skill" as const,
    id: skill.id,
    name: skill.name,
    blurb: skill.summary ?? skill.description,
    // Matches SkillCard's link, so a result lands where a card would.
    href: `/skills/${skill.plugin}#${skill.name}`,
    context: skill.plugin,
    text: [
      skill.name,
      skill.summary,
      skill.description,
      skill.jobs?.join(". "),
      skill.category,
    ]
      .filter(Boolean)
      .join(". "),
  }));
}

/**
 * Every tool and bundle, including the ones `/tools` hides.
 *
 * `visibleTools` drops a tool once a bundle wraps it, because the grid should not show a card for
 * something the bundle already covers. Search indexes `tools` instead: `/tools/[id]` builds a page
 * for every id, so a wrapped tool is still a real destination, and someone searching "gitleaks"
 * means gitleaks - answering with the bundle that happens to contain it, or with nothing, is worse
 * than answering with the tool and letting its page name the bundle.
 *
 * `problem` and `benefits` are the reason tool results rank at all: the artifact's prose is two
 * paragraphs of what a tool is for, where the old placeholder rows had a name and one line.
 */
function toolDocs(): SearchDoc[] {
  return tools.map((tool: ToolEntry) => ({
    key: `tool:${tool.id}`,
    kind: "tool" as const,
    id: tool.id,
    name: tool.name,
    blurb: tool.summary,
    href: `/tools/${tool.id}`,
    // A bundle is not a tool you add; saying so is worth more than repeating its category.
    context: isBundle(tool) ? "bundle" : tool.category,
    text: [
      tool.name,
      tool.summary,
      tool.problem,
      tool.benefits.join(". "),
      tool.category,
      tool.capabilities.join(". "),
      tool.stacks.join(". "),
    ]
      .filter(Boolean)
      .join(". "),
  }));
}

function pluginDocs(): SearchDoc[] {
  return plugins.map((plugin: PluginEntry) => ({
    key: `plugin:${plugin.id}`,
    kind: "plugin" as const,
    id: plugin.id,
    name: plugin.name,
    blurb: plugin.summary ?? "",
    href: `/skills/${plugin.id}`,
    context: `${plugin.agents.length} agent${plugin.agents.length === 1 ? "" : "s"}`,
    // Name and summary only, deliberately.
    //
    // A plugin's `problem` and `benefits` enumerate what all twenty-five of its skills do, so
    // embedding them makes one document that is mildly about everything: indexing that prose put
    // three plugins above every skill for "I want a skill for documentation", because each
    // plugin's blurb mentions documentation somewhere. The skill that actually writes documents
    // is the better answer, and a plugin is reachable through it.
    text: [plugin.name, plugin.summary].filter(Boolean).join(". "),
  }));
}

/**
 * Every document, in a fixed order.
 *
 * The order is the index's row order, so the builder and the ranker agree on which vector belongs
 * to which document without storing the key twice. `Planned` skills are already excluded upstream
 * by `browsableSkills`.
 */
export function searchCorpus(): SearchDoc[] {
  return [...skillDocs(), ...toolDocs(), ...pluginDocs()];
}
