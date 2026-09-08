#!/usr/bin/env node
/**
 * Embeds the search corpus and writes src/data/search-index.json.
 *
 * Run by hand after a catalogue sync, and by CI to check the committed index is current. The
 * output is committed: the corpus only changes when a sync PR lands, so paying for 80 embeddings
 * on every cold lambda would be waste, and a committed index is reviewable in the diff.
 *
 *   node --experimental-strip-types scripts/build-search-index.mjs         # write
 *   node --experimental-strip-types scripts/build-search-index.mjs --check # verify, exit 1 on drift
 *
 * Node runs the TypeScript corpus module directly rather than through a bundler, so the adapter
 * has exactly one definition shared with the app.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const OUT = join(root, "src/data/search-index.json");

/**
 * all-MiniLM-L6-v2, 8-bit quantised: 384 dimensions, ~23MB of weights.
 *
 * Chosen over a larger model because measured retrieval on this corpus is already good - real
 * queries separate from nonsense by 0.34 against 0.14 - and the whole point of running locally is
 * that no query leaves the machine. A bigger model would cost seconds of cold start for ranking
 * gains this corpus is too small to show.
 */
const MODEL = "Xenova/all-MiniLM-L6-v2";
const DTYPE = "q8";

/**
 * How far a committed index may drift from a fresh build before it counts as stale.
 *
 * The vectors cannot be compared byte-for-byte across machines: the same q8 weights run through
 * different ONNX kernels on arm64 and x64, and the last bits disagree. That is why a file built
 * on a maintainer's Mac failed this check on a Linux runner while being perfectly current.
 *
 * 1e-3 per component is two orders of magnitude above that hardware noise and an order of
 * magnitude below the ~1e-2 inter-rank gaps the ranker actually resolves, so a real corpus change
 * still trips it while a rebuild on another architecture does not.
 */
const VECTOR_TOLERANCE = 1e-3;

/**
 * Returns a human-readable reason the committed index is stale, or null when it is current.
 * Everything except the float vectors is compared exactly - a changed model, dtype, dimension,
 * schema version or corpus key list is a real difference, not numerical noise.
 */
function indexDrift(existing, fresh) {
  for (const field of ["schemaVersion", "model", "dtype", "dim"]) {
    if (existing[field] !== fresh[field]) {
      return `${field} is ${existing[field]}, expected ${fresh[field]}`;
    }
  }

  if (existing.keys?.length !== fresh.keys.length) {
    return `${existing.keys?.length ?? 0} documents, expected ${fresh.keys.length}`;
  }
  for (let i = 0; i < fresh.keys.length; i++) {
    if (existing.keys[i] !== fresh.keys[i]) {
      return `document ${i} is ${existing.keys[i]}, expected ${fresh.keys[i]}`;
    }
  }

  if (existing.vectors?.length !== fresh.vectors.length) {
    return `${existing.vectors?.length ?? 0} vector values, expected ${fresh.vectors.length}`;
  }
  for (let i = 0; i < fresh.vectors.length; i++) {
    const delta = Math.abs(existing.vectors[i] - fresh.vectors[i]);
    if (!(delta <= VECTOR_TOLERANCE)) {
      const key = fresh.keys[Math.floor(i / fresh.dim)];
      return `vector for ${key} differs by ${delta.toExponential(1)}`;
    }
  }

  return null;
}

async function main() {
  const check = process.argv.includes("--check");

  // The app's own adapter, so the index can never disagree with what the route searches.
  const { searchCorpus } = await import(join(root, "src/lib/search/corpus.ts"));

  const docs = searchCorpus();
  if (docs.length === 0) throw new Error("Corpus is empty; refusing to build.");

  const { pipeline } = await import("@huggingface/transformers");
  const embed = await pipeline("feature-extraction", MODEL, { dtype: DTYPE });

  const output = await embed(
    docs.map((doc) => doc.text),
    { pooling: "mean", normalize: true },
  );

  const dim = output.dims[1];
  const vectors = Array.from(output.data);
  if (vectors.length !== docs.length * dim) {
    throw new Error(
      `Expected ${docs.length * dim} values, got ${vectors.length}.`,
    );
  }

  const index = {
    // Bumped when the document text or the model changes, so a stale index is detectable
    // rather than silently mis-ranking.
    schemaVersion: 1,
    model: MODEL,
    dtype: DTYPE,
    dim,
    // Corpus order. `rank.ts` maps vector i to keys[i]; storing the key list once rather than
    // per-vector keeps the file honest about that contract.
    keys: docs.map((doc) => doc.key),
    // Rounded to 4 decimals. Measured worst-case cosine drift across every document pair is
    // 1.4e-4, against inter-rank gaps of ~1e-2 - 70x smaller than the closest call the ranker
    // ever has to make, for a fifth off the committed file.
    vectors: vectors.map((value) => Math.round(value * 1e4) / 1e4),
  };

  const json = JSON.stringify(index, null, 2) + "\n";

  if (check) {
    const existing = JSON.parse(readFileSync(OUT, "utf8"));
    const drift = indexDrift(existing, index);
    if (drift) {
      console.error(`search-index.json is stale: ${drift}`);
      console.error("Run: pnpm build:search-index");
      process.exit(1);
    }
    console.log(`search-index.json is current (${docs.length} documents).`);
    return;
  }

  writeFileSync(OUT, json);
  const kb = (Buffer.byteLength(json) / 1024).toFixed(0);
  console.log(
    `Wrote ${docs.length} documents x ${dim} dims to src/data/search-index.json (${kb} KB).`,
  );
}

await main();
