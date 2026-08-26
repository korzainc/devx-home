import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";
import { parse as parseYaml } from "yaml";

// Entries are files, added by pull request, for the same reason the updates entries are: the body
// is prose and the review is the point. Reading them out of Linear would keep the page current at
// the cost of publishing internal ticket wording.

/** How real the work is. Deliberately not a date: nothing here carries a delivery commitment. */
export type RoadmapStage = "exploring" | "planned" | "building" | "shipped";

/** The part of the portal an entry touches. Doubles as the filter above each section. */
export type RoadmapCategory =
  "gap analysis" | "skills" | "catalogue" | "access" | "portal";

export type RoadmapEntry = {
  /** Filename without the extension, and the join key for anything attached to an entry later. */
  slug: string;
  title: string;
  stage: RoadmapStage;
  category: RoadmapCategory;
  /** One or two lines. Clamped on the card, shown in full on the entry page. */
  summary: string;
  /** What having it would get you. Quiet label on the entry page. */
  outcome?: string;
  /** What we still want to know. Absent once the answer stops mattering. */
  question?: string;
  /** Shipped only, as `YYYY-MM`. */
  landed?: string;
  /** Rendered here, at build time, so the page ships no markdown parser to the browser. */
  bodyHtml: string;
};

/** Reading order of the page: least committed first. */
export const roadmapStages: RoadmapStage[] = [
  "exploring",
  "planned",
  "building",
  "shipped",
];

const roadmapCategories: RoadmapCategory[] = [
  "gap analysis",
  "skills",
  "catalogue",
  "access",
  "portal",
];

const contentDir = join(process.cwd(), "content", "roadmap");

const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

function parseEntry(file: string): RoadmapEntry {
  const raw = readFileSync(join(contentDir, file), "utf8");
  const match = frontmatter.exec(raw);
  if (!match) {
    throw new Error(`${file}: no frontmatter block`);
  }

  const { title, stage, category, summary, outcome, question, landed } =
    parseYaml(match[1]) as Record<string, string>;

  if (!title || !summary) {
    throw new Error(`${file}: frontmatter needs title and summary`);
  }

  // Closed sets, checked here rather than trusted: an unknown stage would drop the entry off the
  // page silently, and a misspelt category would show up as a filter chip matching one card.
  if (!roadmapStages.includes(stage as RoadmapStage)) {
    throw new Error(`${file}: unknown stage ${stage}`);
  }
  if (!roadmapCategories.includes(category as RoadmapCategory)) {
    throw new Error(`${file}: unknown category ${category}`);
  }
  if (stage === "shipped" && !landed) {
    throw new Error(`${file}: a shipped entry needs landed`);
  }

  return {
    slug: file.replace(/\.md$/, ""),
    title,
    stage: stage as RoadmapStage,
    category: category as RoadmapCategory,
    summary,
    outcome,
    question,
    landed,
    bodyHtml: marked.parse(raw.slice(match[0].length), { async: false }),
  };
}

// A function rather than a module-level constant, for the same reason getUpdates is one: nothing
// tells the bundler this module depends on content/, so caching the read would leave `next dev`
// serving the entry files as they were when the server started.
//
// Sorted by slug within a stage. Nothing in a file says when it was added, and inventing an order
// field would be one more thing to keep right for no gain.
export function getRoadmap(): RoadmapEntry[] {
  return readdirSync(contentDir)
    .filter((file) => file.endsWith(".md"))
    .map(parseEntry)
    .sort(
      (a, b) =>
        roadmapStages.indexOf(a.stage) - roadmapStages.indexOf(b.stage) ||
        a.slug.localeCompare(b.slug),
    );
}

export function getRoadmapEntry(slug: string): RoadmapEntry | undefined {
  return getRoadmap().find((entry) => entry.slug === slug);
}
