import { describe, expect, it } from "vitest";
import type { SearchDoc } from "@/lib/search/corpus";
import {
  cosine,
  fuse,
  hasResults,
  LEXICAL_SCORE_RATIO,
  semanticRanking,
  SIMILARITY_CUTOFF,
  SIMILARITY_FLOOR,
  SIMILARITY_MARGIN,
  SIMILARITY_MARGIN_STRICT,
} from "@/lib/search/rank";

function doc(key: string, name = key): SearchDoc {
  return {
    key,
    kind: "skill",
    id: key,
    name,
    blurb: "",
    href: `/${key}`,
    context: "",
    text: name,
  };
}

/** Normalised, so cosine is the dot product. */
function unit(...values: number[]): Float32Array {
  const length = Math.hypot(...values);
  return new Float32Array(values.map((value) => value / length));
}

describe("cosine", () => {
  it("is 1 for identical unit vectors", () => {
    const vector = unit(1, 2, 3);
    expect(cosine(vector, vector)).toBeCloseTo(1);
  });

  it("is 0 for orthogonal vectors", () => {
    expect(cosine(unit(1, 0), unit(0, 1))).toBeCloseTo(0);
  });

  it("reads a document out of a flat array at its stride", () => {
    // Two 2-dim documents packed end to end; the second is the match.
    const vectors = new Float32Array([1, 0, 0, 1]);
    expect(cosine(unit(0, 1), vectors, 0)).toBeCloseTo(0);
    expect(cosine(unit(0, 1), vectors, 2)).toBeCloseTo(1);
  });
});

describe("semanticRanking", () => {
  it("sorts every document by similarity, best first", () => {
    const docs = [doc("a"), doc("b"), doc("c")];
    // a is orthogonal, b is a partial match, c is exact.
    const vectors = new Float32Array([0, 1, 0.7071, 0.7071, 1, 0]);
    const ranking = semanticRanking(unit(1, 0), vectors, docs);

    expect(ranking.map((row) => row.key)).toEqual(["c", "b", "a"]);
    expect(ranking[0].similarity).toBeCloseTo(1);
    expect(ranking[2].similarity).toBeCloseTo(0);
  });
});

describe("fuse", () => {
  const docs = [doc("a"), doc("b"), doc("c"), doc("d")];
  const byKey = new Map(docs.map((entry) => [entry.key, entry]));

  it("ranks a document both signals found above one only a single signal loves", () => {
    // `b` is second on both lists; `a` is first on one and absent from the other.
    const ranked = fuse({
      lexicalKeys: ["a", "b"],
      semanticKeys: ["c", "b"],
      byKey,
    });

    expect(ranked[0].doc.key).toBe("b");
    expect(ranked[0].lexical).toBe(true);
    expect(ranked[0].semantic).toBe(true);
  });

  it("records which signal found a document", () => {
    const ranked = fuse({ lexicalKeys: ["a"], semanticKeys: ["b"], byKey });
    const a = ranked.find((row) => row.doc.key === "a");
    const b = ranked.find((row) => row.doc.key === "b");

    expect(a).toMatchObject({ lexical: true, semantic: false });
    expect(b).toMatchObject({ lexical: false, semantic: true });
  });

  it("ignores a list past `depth`, so a long tail cannot outvote the head", () => {
    const ranked = fuse({
      lexicalKeys: ["a", "b"],
      semanticKeys: ["c", "d"],
      byKey,
      depth: 1,
    });

    expect(ranked.map((row) => row.doc.key).sort()).toEqual(["a", "c"]);
  });

  it("honours the limit", () => {
    expect(
      fuse({
        lexicalKeys: ["a", "b", "c", "d"],
        semanticKeys: [],
        byKey,
        limit: 2,
      }),
    ).toHaveLength(2);
  });

  it("drops a key with no document rather than throwing", () => {
    // A stale index naming a document the corpus no longer has.
    const ranked = fuse({
      lexicalKeys: ["gone", "a"],
      semanticKeys: [],
      byKey,
    });
    expect(ranked.map((row) => row.doc.key)).toEqual(["a"]);
  });
});

describe("hasResults", () => {
  const clear = { topSimilarity: 0.5, meanSimilarity: 0.1 };

  it("accepts a query that clears both the floor and the margin", () => {
    expect(hasResults({ ...clear, lexicalHits: 0 })).toBe(true);
  });

  it("rejects a query that clears the floor but not the margin", () => {
    // Everything is mildly similar: the mark of nonsense, not of a match.
    expect(
      hasResults({
        topSimilarity: SIMILARITY_FLOOR + 0.05,
        meanSimilarity: SIMILARITY_FLOOR + 0.05 - SIMILARITY_MARGIN / 2,
        lexicalHits: 0,
      }),
    ).toBe(false);
  });

  it("rejects a query that clears the margin but not the floor", () => {
    expect(
      hasResults({
        topSimilarity: SIMILARITY_FLOOR - 0.05,
        meanSimilarity: 0,
        lexicalHits: 0,
      }),
    ).toBe(false);
  });

  it("accepts a lexical hit whatever the model thinks", () => {
    // An acronym or an exact tool name the embedding has no representation for.
    expect(
      hasResults({ topSimilarity: 0, meanSimilarity: 0, lexicalHits: 1 }),
    ).toBe(true);
  });

  it("accepts a margin between the default and the strict one only under the default", () => {
    // Framing residue like "new project" clears SIMILARITY_MARGIN but not the strict margin a
    // clause needs when it has siblings from the same compound query.
    const middling = {
      topSimilarity: SIMILARITY_FLOOR + 0.15,
      meanSimilarity: SIMILARITY_FLOOR,
      lexicalHits: 0,
    };
    expect(hasResults(middling)).toBe(true);
    expect(hasResults({ ...middling, margin: SIMILARITY_MARGIN_STRICT })).toBe(
      false,
    );
  });
});

describe("fuse depth", () => {
  const byKey = new Map(
    Array.from({ length: 50 }, (_, i) => doc(`d${i}`)).map((d) => [d.key, d]),
  );
  const keys = Array.from({ length: 50 }, (_, i) => `d${i}`);

  it("admits no more candidates than depth, whatever limit asks for", () => {
    // The /search regression: limit and depth were the same value, so asking for 40 rows let 40
    // documents earn an RRF score on rank position alone and every query returned exactly 40.
    const ranked = fuse({
      lexicalKeys: [],
      semanticKeys: keys,
      byKey,
      depth: 20,
      limit: 40,
    });
    expect(ranked).toHaveLength(20);
  });

  it("still truncates to limit when limit is the smaller of the two", () => {
    const ranked = fuse({
      lexicalKeys: [],
      semanticKeys: keys,
      byKey,
      depth: 20,
      limit: 5,
    });
    expect(ranked).toHaveLength(5);
  });
});

describe("relevance thresholds", () => {
  it("SIMILARITY_CUTOFF sits above the measured nonsense peak", () => {
    // "asdfghjkl" peaked at 0.224 on this corpus; a real match's worst kept row is well above.
    expect(SIMILARITY_CUTOFF).toBeGreaterThan(0.224);
    expect(SIMILARITY_CUTOFF).toBeLessThan(SIMILARITY_FLOOR);
  });

  it("LEXICAL_SCORE_RATIO drops the measured fuzzy tail and keeps real matches", () => {
    // Ratios measured for "review a pull request": requesting-code-review 0.537 and
    // receiving-code-review 0.164 are real; prettier 0.050 and junit 0.035 are token noise.
    expect(0.164).toBeGreaterThan(LEXICAL_SCORE_RATIO);
    expect(0.05).toBeLessThan(LEXICAL_SCORE_RATIO);
  });
});
