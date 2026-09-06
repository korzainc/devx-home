import { describe, expect, it } from "vitest";
import type { SearchDoc } from "@/lib/search/corpus";
import type { Ranked } from "@/lib/search/rank";
import { mergeClauses, splitClauses, taskOf } from "@/lib/search/semantic";

function doc(key: string): SearchDoc {
  return {
    key,
    kind: "skill",
    id: key,
    name: key,
    blurb: "",
    href: `/${key}`,
    context: "",
    text: key,
  };
}

function ranked(key: string): Ranked {
  return { doc: doc(key), score: 0, lexical: false, semantic: false };
}

describe("splitClauses", () => {
  it("leaves a single-intent task alone", () => {
    expect(splitClauses("make my commits better")).toEqual([
      "make my commits better",
    ]);
  });

  it("splits on commas and 'and'", () => {
    expect(splitClauses("planning, CI setup and security")).toEqual([
      "planning",
      "CI setup",
      "security",
    ]);
  });

  it("splits on '&' too", () => {
    expect(splitClauses("linting & formatting")).toEqual([
      "linting",
      "formatting",
    ]);
  });

  it("drops empty clauses from a trailing separator", () => {
    expect(splitClauses("security, ")).toEqual(["security"]);
  });
});

describe("taskOf", () => {
  it("strips a compound framing phrase from both ends of a multi-intent request", () => {
    // Regression: the frame that motivated splitClauses in the first place.
    expect(
      taskOf(
        "i want to get started with a new project, help me get skills for planning, CI setup and security",
      ),
    ).toBe("new project, planning, CI setup and security");
  });
});

describe("mergeClauses", () => {
  it("interleaves each clause's own ranking round-robin", () => {
    const merged = mergeClauses(
      [
        [ranked("a1"), ranked("a2")],
        [ranked("b1"), ranked("b2")],
      ],
      4,
    );
    expect(merged.map((r) => r.doc.key)).toEqual(["a1", "b1", "a2", "b2"]);
  });

  it("does not let one clause's raw score order override the interleave", () => {
    // b1 outscores everything, but a1 - a's own best - still goes first: RRF scores from
    // independently embedded clauses are not comparable to each other.
    const a1 = { ...ranked("a1"), score: 0.01 };
    const b1 = { ...ranked("b1"), score: 0.9 };
    const merged = mergeClauses([[a1], [b1]], 2);
    expect(merged.map((r) => r.doc.key)).toEqual(["a1", "b1"]);
  });

  it("skips a clause once its ranking is exhausted", () => {
    const merged = mergeClauses(
      [[ranked("a1")], [ranked("b1"), ranked("b2")]],
      3,
    );
    expect(merged.map((r) => r.doc.key)).toEqual(["a1", "b1", "b2"]);
  });

  it("drops a duplicate a later clause also ranked", () => {
    const merged = mergeClauses([[ranked("a1")], [ranked("a1")]], 2);
    expect(merged.map((r) => r.doc.key)).toEqual(["a1"]);
  });

  it("stops at limit even with more candidates available", () => {
    const merged = mergeClauses(
      [
        [ranked("a1"), ranked("a2")],
        [ranked("b1"), ranked("b2")],
      ],
      2,
    );
    expect(merged).toHaveLength(2);
  });

  it("returns nothing for an empty ranking list", () => {
    expect(mergeClauses([], 8)).toEqual([]);
  });
});
