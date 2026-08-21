import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";
import { parse as parseYaml } from "yaml";

// Entries are files rather than JSON because the body is prose.
export type ChangelogEntry = {
  /** Filename without the extension. Identity for the anchor link, since dates can repeat. */
  slug: string;
  date: string;
  title: string;
  /** Rendered here, at build time, so the page ships no markdown parser to the browser. */
  bodyHtml: string;
};

const contentDir = join(process.cwd(), "content", "changelog");

const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

function parseEntry(file: string): ChangelogEntry {
  const raw = readFileSync(join(contentDir, file), "utf8");
  const match = frontmatter.exec(raw);
  if (!match) {
    throw new Error(`${file}: no frontmatter block`);
  }

  const { date, title } = parseYaml(match[1]) as Record<string, string>;
  if (!date || !title) {
    throw new Error(`${file}: frontmatter needs date and title`);
  }

  return {
    slug: file.replace(/\.md$/, ""),
    date,
    title,
    bodyHtml: marked.parse(raw.slice(match[0].length), { async: false }),
  };
}

// A function rather than a module-level constant: nothing tells the bundler this module depends on
// content/, so caching the read would leave `next dev` serving the entry files as they were when
// the server started. Runs once per page render, which means once per build.
//
// Newest first. Dates are ISO strings, so they sort lexically; slug breaks the tie when two
// entries land on the same day.
export function getChangelog(): ChangelogEntry[] {
  return readdirSync(contentDir)
    .filter((file) => file.endsWith(".md"))
    .map(parseEntry)
    .sort(
      (a, b) => b.date.localeCompare(a.date) || b.slug.localeCompare(a.slug),
    );
}
