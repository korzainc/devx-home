import { describe, expect, it } from "vitest";
import { getRoadmap } from "./roadmap";

// The loader throws on a malformed entry, which without this suite would mean a bad frontmatter
// block ships and fails when someone opens the page. Calling getRoadmap here moves that to CI.
describe("roadmap entries", () => {
  const entries = getRoadmap();

  it("finds entries at all", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("has no duplicate slugs", () => {
    // The slug is the route and, once votes exist, the join key for them.
    const slugs = entries.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("gives every entry a body", () => {
    // Every card links to its page, so an entry with only frontmatter is a dead end.
    for (const entry of entries) {
      expect(entry.bodyHtml.trim(), `${entry.slug} has an empty body`).not.toBe(
        "",
      );
    }
  });

  it("ends every open entry in a question", () => {
    // The page promises this in its own copy.
    for (const entry of entries.filter((entry) => entry.stage !== "shipped")) {
      expect(entry.question, `${entry.slug} asks nothing`).toBeTruthy();
    }
  });

  it("dates shipped entries and only shipped entries", () => {
    for (const entry of entries) {
      if (entry.stage === "shipped") {
        // The card formats this as `${landed}-01T00:00:00Z`, so a stray format reads as
        // "Invalid Date" on the page rather than failing anywhere.
        const parsed = new Date(`${entry.landed}-01T00:00:00Z`);
        expect(
          Number.isNaN(parsed.getTime()),
          `${entry.slug} has an unparsable landed ${entry.landed}`,
        ).toBe(false);
      } else {
        expect(
          entry.landed,
          `${entry.slug} is not shipped but claims a landed date`,
        ).toBeUndefined();
      }
    }
  });
});
