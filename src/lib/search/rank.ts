import type { SearchDoc } from "@/lib/search/corpus";

/**
 * Fusing a lexical rank with a semantic one, and deciding when to return nothing.
 *
 * Kept free of both the model and the index file so the tests exercise the real rule on
 * hand-written vectors. `search.ts` reuses the existing lexical matcher; this decides the order.
 */

/**
 * Reciprocal Rank Fusion. `1 / (K + rank)` per list, summed.
 *
 * Ranks, not scores: a cosine similarity and a BM25 score have no common scale, and normalising
 * them against each other means re-tuning whenever the corpus grows. K=60 is the value the
 * original TREC work settled on - large enough that the top few ranks are close together, so a
 * document both lists like beats one that only one list loves.
 */
const RRF_K = 60;

/**
 * A query must clear both of these before any semantic result is shown.
 *
 * Embeddings always return a nearest neighbour, so without a gate "asdfghjkl" produces the eight
 * least-unrelated rows and the empty state is unreachable.
 *
 * Measured against this corpus and this model: real queries bottom out at 0.348 similarity, and
 * the best nonsense query reaches 0.263. 0.30 sits in that gap with room either side. The margin
 * is the second condition because a floor alone was once the only test and the gap was far
 * thinner - a meaningful query has one clear winner, while nonsense is uniformly mediocre against
 * everything, so requiring the best match to stand clear of the corpus mean separates them even
 * when the absolute scores drift.
 *
 * Both are properties of the (model, document text) pair, not universal constants. Recalibrate
 * when either changes: wiring the real CI catalogue in replaced 121-character tool rows with
 * 489-character ones, which moved every number here and briefly let "brd" through.
 */
export const SIMILARITY_FLOOR = 0.3;

/** How far the best match must sit above the mean similarity across the whole corpus. */
export const SIMILARITY_MARGIN = 0.1;

/**
 * The margin a clause needs when it is competing against sibling clauses split out of the same
 * query (see `splitClauses` in `semantic.ts`).
 *
 * A lone query only has to clear the corpus's background noise, so 0.1 is enough. A clause that
 * is really just framing residue - "new project" left over after stripping "help me get started
 * with a new project, ..." - clears 0.1 too: at 0.156 measured, it sits closer to a real query's
 * margin than to nonsense's. It does not, however, clear a margin as wide as an actual intent in
 * the same query typically does (0.29 for "planning" in that same request) - so a clause with
 * siblings is held to the stronger of the two.
 */
export const SIMILARITY_MARGIN_STRICT = 0.2;

export type Ranked = {
  doc: SearchDoc;
  score: number;
  /** Which signals found it, so a row can say why it is here. */
  lexical: boolean;
  semantic: boolean;
};

/** Cosine similarity of two already-normalised vectors, so the norms are not recomputed. */
export function cosine(a: Float32Array, b: Float32Array, offset = 0): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[offset + i];
  return dot;
}

/**
 * Every document's similarity to the query, sorted best first.
 *
 * `vectors` is one flat Float32Array of `docs.length * dim` values in corpus order, which is how
 * the index is stored: an array of arrays would cost a per-document object for no gain.
 */
export function semanticRanking(
  query: Float32Array,
  vectors: Float32Array,
  docs: SearchDoc[],
): { key: string; similarity: number }[] {
  const dim = query.length;
  return docs
    .map((doc, i) => ({
      key: doc.key,
      similarity: cosine(query, vectors, i * dim),
    }))
    .sort((a, b) => b.similarity - a.similarity);
}

/**
 * Fuse the two rankings.
 *
 * `lexicalKeys` and `semanticKeys` are ordered best-first. Only the top `depth` of each is
 * considered: past that a list is guessing, and letting it vote adds noise that RRF's flat tail
 * cannot distinguish from signal.
 */
export function fuse({
  lexicalKeys,
  semanticKeys,
  byKey,
  depth = 20,
  limit = 8,
}: {
  lexicalKeys: string[];
  semanticKeys: string[];
  byKey: Map<string, SearchDoc>;
  depth?: number;
  limit?: number;
}): Ranked[] {
  const scores = new Map<string, Ranked>();

  function contribute(keys: string[], signal: "lexical" | "semantic") {
    keys.slice(0, depth).forEach((key, index) => {
      const doc = byKey.get(key);
      if (!doc) return;
      const existing = scores.get(key) ?? {
        doc,
        score: 0,
        lexical: false,
        semantic: false,
      };
      existing.score += 1 / (RRF_K + index + 1);
      existing[signal] = true;
      scores.set(key, existing);
    });
  }

  contribute(lexicalKeys, "lexical");
  contribute(semanticKeys, "semantic");

  return [...scores.values()]
    .sort((a, b) => b.score - a.score || a.doc.name.localeCompare(b.doc.name))
    .slice(0, limit);
}

/**
 * Whether a query found anything worth showing.
 *
 * Either signal is enough on its own: the two semantic thresholds catch nonsense the model
 * politely answers, and a lexical hit rescues the exact names - acronyms, tool names, a `/skill`
 * typed verbatim - that a sentence-embedding model has no representation for.
 */
export function hasResults({
  topSimilarity,
  meanSimilarity,
  lexicalHits,
  margin = SIMILARITY_MARGIN,
}: {
  topSimilarity: number;
  meanSimilarity: number;
  lexicalHits: number;
  margin?: number;
}): boolean {
  if (lexicalHits > 0) return true;
  return (
    topSimilarity >= SIMILARITY_FLOOR &&
    topSimilarity - meanSimilarity >= margin
  );
}
