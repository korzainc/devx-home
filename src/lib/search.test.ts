import { describe, expect, it } from "vitest";
import { skills } from "./catalogue";
import { entryHaystack, matchesQuery, matchesTerm } from "./search";

/** The grid's own haystack. Entries, not names: two plugins ship `code-review`. */
function hits(query: string) {
  return skills.filter((skill) => matchesQuery(query, entryHaystack(skill)));
}

describe("catalogue search", () => {
  it("ignores word order", () => {
    expect(matchesQuery("review code", "code-review")).toBe(true);
    expect(matchesQuery("code review", "code-review")).toBe(true);
  });

  it("matches across hyphens and underscores", () => {
    expect(matchesQuery("test driven", "test-driven-development")).toBe(true);
    expect(matchesQuery("agentic e2e", "agentic-e2e")).toBe(true);
    expect(matchesQuery("git worktrees", "using_git_worktrees")).toBe(true);
  });

  it("requires every term", () => {
    expect(matchesQuery("code review python", "code-review")).toBe(false);
  });

  it("ignores punctuation in the query", () => {
    expect(matchesQuery("tdd, review", "tdd code-review")).toBe(true);
    expect(matchesQuery("(testing)", "test-driven development")).toBe(true);
    expect(hits("tdd, review").length).toBeGreaterThan(0);
    expect(hits("tdd, review")).toEqual(hits("tdd review"));
  });

  it("treats an empty or whitespace query as no filter", () => {
    expect(matchesQuery("", "anything")).toBe(true);
    expect(matchesQuery("   ", "anything")).toBe(true);
  });

  it("does not match inside a word", () => {
    expect(
      matchesQuery("unit", "Scan a codebase for deepening opportunities"),
    ).toBe(false);
    expect(matchesQuery("spec", "refining an underspecified ask")).toBe(false);
  });

  it("matches a prefix of a word", () => {
    expect(matchesQuery("review", "requesting-code-reviewer")).toBe(true);
    expect(matchesQuery("test", "testing the harness")).toBe(true);
  });

  it("matches an inflected query against a shorter word", () => {
    expect(matchesQuery("testing", "test-driven development")).toBe(true);
    expect(matchesQuery("documentation", "writes the document")).toBe(true);
  });

  it("does not join two inflections of the same stem", () => {
    expect(matchesQuery("testing", "unit tests")).toBe(false);
    expect(hits("testing").length).toBeGreaterThanOrEqual(7);
  });

  it("does not let the reverse direction match on a stub", () => {
    expect(matchesQuery("architecture", "a codebase")).toBe(false);
    expect(matchesQuery("reviewer", "re-run the tests")).toBe(false);
  });

  it("finds the skills a user would search for by job", () => {
    for (const query of [
      "review code",
      "test driven",
      "end to end",
      "testing",
    ]) {
      expect(hits(query).length, `"${query}" matches no skill`).toBeGreaterThan(
        0,
      );
    }
  });

  it("does not match through facet values", () => {
    // A leak returns 51, not 1. The probe must be a word that is only ever a facet value.

    const codebase = hits("codebase");
    expect(codebase.length).toBeLessThan(skills.length);
    for (const skill of codebase) {
      expect(entryHaystack(skill).toLowerCase()).toContain("code");
    }

    // Through the word "build" in prose, not a facet.
    for (const skill of hits("buildings")) {
      expect(entryHaystack(skill).toLowerCase()).toContain("build");
    }
  });

  it("still returns nothing for a term the catalogue has no skill for", () => {
    expect(hits("unit")).toHaveLength(0);
    expect(hits("kubernetes")).toHaveLength(0);
  });
});

describe("the reverse direction only matches inflections", () => {
  it("does not let a short word swallow a longer query", () => {
    // `when` used to match 33 of 57 rows.
    for (const magnet of ["whenever", "userland", "checklist"]) {
      expect(hits(magnet), magnet).toHaveLength(0);
    }
    expect(hits("worktree").length).toBeLessThan(3);
  });

  it("still reaches every skill by its own name", () => {
    for (const skill of skills) {
      expect(hits(skill.name).length, skill.id).toBeGreaterThan(0);
    }
  });

  it("searches the jobs, which nothing else in the haystack carries", () => {
    // Shares no stem with any summary, description or name, so a hit can only come from jobs.
    const onlyInJobs = "edit prose before publishing it";
    expect(
      skills.some(
        (s) =>
          s.summary.includes(onlyInJobs) || s.description.includes(onlyInJobs),
      ),
    ).toBe(false);
    expect(hits(onlyInJobs).length).toBeGreaterThan(0);
  });
});

describe("the suffix set", () => {
  // Each was individually deletable from SUFFIXES with a green suite.
  it.each([
    ["planning", "plan"],
    ["debugging", "debug"],
    ["committed", "commit"],
    ["reviews", "review"],
    ["branches", "branch"],
    ["reviewed", "review"],
    ["reviewer", "review"],
    ["reviewers", "review"],
    ["writers", "write"],
    ["testing", "test"],
    ["suggestions", "suggest"],
    ["documentation", "document"],
    ["statements", "state"],
    ["directly", "direct"],
  ])("matches %s against %s", (term, word) => {
    expect(matchesTerm(term, word)).toBe(true);
  });

  it("still refuses a word that is not a stem of the term", () => {
    // The guard is on the word length, not the term's.
    for (const [term, word] of [
      ["they", "the"],
      ["ally", "all"],
      ["ands", "and"],
    ]) {
      expect(matchesTerm(term, word), `${term}/${word}`).toBe(false);
    }
    expect(matchesTerm("worktree", "work")).toBe(false);
  });
});
