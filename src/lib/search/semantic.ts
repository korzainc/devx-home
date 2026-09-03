import MiniSearch from "minisearch";
import indexData from "@/data/search-index.json";
import { searchCorpus, type SearchDoc } from "@/lib/search/corpus";
import {
  fuse,
  hasResults,
  semanticRanking,
  type Ranked,
} from "@/lib/search/rank";

/**
 * The search engine. Server-only: it loads a 23MB model, which has no business in a browser
 * bundle, and the route is what keeps it out of one.
 *
 * Both halves are lazy and cached at module scope, so a warm lambda pays for neither. The model
 * is the expensive one - roughly 7s on a cold start, then ~15ms a query.
 */

/**
 * Words that carry no retrieval signal but do carry weight in a short lexical query.
 *
 * Measured: without this, "I want a skill for documentation" ranked three skills whose only
 * connection was the word "skill" above the one that writes documents, because `skill` appears in
 * half the corpus. Deliberately small - a long stopword list starts eating real queries like
 * "how to" ("howto" is not a word we have) and "no code".
 */
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "any",
  "anything",
  "are",
  "be",
  "can",
  "do",
  "does",
  "for",
  "from",
  "get",
  "have",
  "how",
  "i",
  "in",
  "is",
  "it",
  "its",
  "me",
  "my",
  "need",
  "of",
  "on",
  "or",
  "should",
  "so",
  "some",
  "something",
  "that",
  "the",
  "then",
  "this",
  "to",
  "want",
  "was",
  "what",
  "when",
  "which",
  "with",
  "would",
  "you",
  "your",
]);

/**
 * Phrases that frame a request without describing the task.
 *
 * "I want a skill for documentation" ranks badly unframed. At 384 dimensions the words "I want a
 * skill for" carry enough weight to pull the query toward skills that are *about* skills, and the
 * documentation skill drops out of the top four entirely.
 *
 * Both passes get the stripped query, not just the embedding. "skill", "tool" and "plugin" name
 * the catalogue rather than any job inside it, so on "help me get skills for planning" the
 * lexical pass matched the literal word "skills" and put /writing-skills and two plugin rows
 * above every planning skill.
 *
 * Unanchored and global, because framing is not only a prefix: that same query wraps the task at
 * both ends ("i want to get started with... help me get skills for..."). An earlier anchored
 * version cut the middle and left "to get started with a new project, help me get planning" -
 * grammatical debris that embedded worse than the original. Hence the edge-word pass below.
 *
 * Falls back to the original when the frame is all there was, so "how to" stays "how to" rather
 * than becoming the empty string.
 */
const QUERY_FRAMES: RegExp[] = [
  /^\s*(i\s+)?(want|need|am\s+looking\s+for|looking\s+for|would\s+like)\b/i,
  /\b(get|find|show|give)?\s*(me)?\s*(a|an|any|some)?\s*(skill|tool|plugin)s?\s+(for|to|that|which)\b/gi,
  /\b(help|show|find|give)\s+me\s+(with|to|a|an|some)?\b/gi,
  /\b(is\s+there|do\s+you\s+have|can\s+i\s+get)\s*(a|an|any)?\b/gi,
  /\b(how\s+(do|can)\s+i|how\s+to)\b/gi,
  /\b(i\s+)?(am|'m|im)\s*(looking\s+for|trying\s+to)\s*(a|an|some)?\b/gi,
  /\b(something|anything)\s+(that|which|to)\b/gi,
  // Intent, not a task any catalogue row describes.
  /\bget(ting)?\s+started\s+(with|on)\b/gi,
];

/**
 * Words left stranded at either edge once a frame is cut out. Stripped one at a time from each
 * end, so "to get started with a new project" does not keep a leading "to".
 */
const EDGE_WORDS = /^(i|to|for|with|and|a|an|the|me|get)\b\s*/i;
const TRAILING_EDGE_WORDS = /\s+(to|for|with|and|a|an|the|me|get)$/i;

/** The task inside a request. Falls back to the original when the frame is all there was. */
export function taskOf(query: string): string {
  let task = query;
  for (const frame of QUERY_FRAMES) task = task.replace(frame, " ");

  task = task
    .replace(/\s+/g, " ")
    // Punctuation a cut frame leaves behind, at either end.
    .replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "");

  // Repeated, not single-pass: cutting one frame can expose another edge word behind it.
  let previous = "";
  while (task !== previous) {
    previous = task;
    task = task.replace(EDGE_WORDS, "").replace(TRAILING_EDGE_WORDS, "").trim();
  }

  return task || query;
}

const index = indexData as {
  schemaVersion: number;
  model: string;
  dim: number;
  keys: string[];
  vectors: number[];
};

/** Flattened once. `rank.ts` reads it with a stride, so it is never sliced per query. */
let vectors: Float32Array | undefined;
let docs: SearchDoc[] | undefined;
let byKey: Map<string, SearchDoc> | undefined;
let lexical: MiniSearch<SearchDoc> | undefined;

function corpus() {
  if (docs && byKey && vectors && lexical) {
    return { docs, byKey, vectors, lexical };
  }

  docs = searchCorpus();

  // The index is committed and the corpus is code, so these drift apart exactly when someone
  // edits a data file and forgets to rebuild. Failing loudly here beats ranking every query
  // against the wrong vectors.
  if (docs.length !== index.keys.length) {
    throw new Error(
      `search-index.json has ${index.keys.length} documents, corpus has ${docs.length}. Run: pnpm build:search-index`,
    );
  }
  const drifted = docs.findIndex((doc, i) => doc.key !== index.keys[i]);
  if (drifted !== -1) {
    throw new Error(
      `search-index.json is stale at position ${drifted} (expected ${docs[drifted].key}, found ${index.keys[drifted]}). Run: pnpm build:search-index`,
    );
  }

  vectors = new Float32Array(index.vectors);
  byKey = new Map(docs.map((doc) => [doc.key, doc]));

  lexical = new MiniSearch<SearchDoc>({
    fields: ["name", "text"],
    idField: "key",
    // The name is the one field a user types verbatim - a tool name, a /skill. It outranks the
    // prose it also appears in.
    //
    // `fuzzy` and `prefix` are functions of the term length, not flat values, because on a short
    // token one edit is a different word rather than a typo. At a flat 0.2 the query "brd" matched
    // "bad" in Semgrep's prose, and since any lexical hit bypasses the semantic gate, that single
    // match resurrected a query the model had correctly scored as nonsense. Both still apply to
    // the longer terms, where a real typo or a half-typed name is plausible.
    searchOptions: {
      boost: { name: 3 },
      fuzzy: (term) => (term.length >= 5 ? 0.2 : false),
      prefix: (term) => term.length >= 4,
      combineWith: "OR",
    },
    processTerm: (term) => {
      const lower = term.toLowerCase();
      return STOPWORDS.has(lower) ? null : lower;
    },
  });
  lexical.addAll(docs);

  return { docs, byKey, vectors, lexical };
}

/** Held across queries: the model load is the whole cost, and it is identical every time. */
let embedder: Promise<(text: string) => Promise<Float32Array>> | undefined;

function getEmbedder() {
  if (embedder) return embedder;
  return (embedder = (async () => {
    const { pipeline } = await import("@huggingface/transformers");
    const extract = await pipeline("feature-extraction", index.model, {
      dtype: "q8",
    });
    return async (text: string) => {
      const output = await extract([text], {
        pooling: "mean",
        normalize: true,
      });
      // A tensor's `data` is a union over every numeric array type the runtime can return.
      // Feature extraction is always floating point; asserting it keeps the copy cheap, and a
      // wrong dtype would surface immediately as a ranking that matches nothing.
      return new Float32Array(output.data as Float32Array);
    };
  })());
}

export type SearchResult = Ranked;

export type SearchOutcome = {
  results: SearchResult[];
  /** False when the embedding model was unavailable and only lexical ranking ran. */
  semantic: boolean;
};

/**
 * Rank the corpus against a natural-language query.
 *
 * Lexical always runs; it is free and it is the only thing that reliably finds an exact name. The
 * embedding is what makes "make my commits better" reach /code-review, and if the model fails to
 * load the search degrades to lexical rather than erroring - a keyword result beats a 500.
 */
export async function search(
  query: string,
  { limit = 8 }: { limit?: number } = {},
): Promise<SearchOutcome> {
  const trimmed = query.trim();
  if (!trimmed) return { results: [], semantic: true };

  const { docs, byKey, vectors, lexical } = corpus();

  // Both passes see the task, not the request. "skill", "tool" and "plugin" are words about the
  // catalogue rather than about any job in it, so a query that names one - "help me get skills
  // for planning" - otherwise ranks /writing-skills and the plugin rows above the planning
  // skills it asked for. `taskOf` already removes them for the embedding; the lexical pass has
  // the same problem and needs the same input.
  const task = taskOf(trimmed);
  const lexicalKeys = lexical.search(task).map((hit) => hit.id as string);

  let semanticKeys: string[] = [];
  let topSimilarity = 0;
  let meanSimilarity = 0;
  let semantic = true;
  try {
    const embed = await getEmbedder();
    const ranking = semanticRanking(await embed(task), vectors, docs);
    semanticKeys = ranking.map((row) => row.key);
    topSimilarity = ranking[0]?.similarity ?? 0;
    meanSimilarity =
      ranking.reduce((total, row) => total + row.similarity, 0) /
      (ranking.length || 1);
  } catch (error) {
    // A missing model or a failed load is not a failed search.
    console.error(
      "Semantic ranking unavailable; falling back to lexical.",
      error,
    );
    semantic = false;
    // Reset so a transient failure does not poison every later query.
    embedder = undefined;
  }

  if (
    !hasResults({
      topSimilarity,
      meanSimilarity,
      lexicalHits: lexicalKeys.length,
    })
  ) {
    return { results: [], semantic };
  }

  return {
    results: fuse({ lexicalKeys, semanticKeys, byKey, limit }),
    semantic,
  };
}
