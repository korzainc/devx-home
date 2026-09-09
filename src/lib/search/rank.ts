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
 * The similarity a single document must reach to be worth showing at all.
 *
 * `SIMILARITY_FLOOR` and `SIMILARITY_MARGIN` decide whether a *query* found anything; neither
 * says which documents qualify. `semanticRanking` returns the whole corpus - every document has
 * some cosine similarity to every query - so without a per-document floor RRF scores whatever
 * slice of that list `depth` admits, and a query for "scan for secrets" renders `pyright-lsp`
 * purely because it placed 40th out of 79.
 *
 * Measured across this corpus and model: a real query's genuine matches sit at 0.30-0.60 and have
 * decayed to 0.17-0.27 by rank 12-20, while the best nonsense query ("asdfghjkl") peaks at 0.224.
 * 0.25 sits above that peak and below every real match worth a row.
 *
 * Same caveat as the constants above: a property of the (model, document text) pair. Recalibrate
 * when either changes.
 */
export const SIMILARITY_CUTOFF = 0.25;

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

/**
 * How weak a lexical hit may be, relative to the query's best, and still vote.
 *
 * BM25 scores are not comparable across queries - the top hit is 86 for "review pull request" and
 * 21 for "scan secrets" - so this is a ratio, not an absolute. The ratio *is* stable: measured on
 * this corpus, genuine matches sit above 0.15 of the top score while the fuzzy/prefix tail that
 * `combineWith: "OR"` admits falls far below (prettier at 0.050 and junit at 0.035 for "review
 * pull request", jest at 0.022 for "type checking").
 *
 * 0.1 keeps every real match measured, including the deliberately generous ones a bundle or an
 * alias produces, and drops the tail that only matched a common token in someone else's prose.
 */
export const LEXICAL_SCORE_RATIO = 0.1;

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
