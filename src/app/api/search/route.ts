import { search } from "@/lib/search/semantic";

/**
 * Semantic search over the skills, tools and plugins catalogues.
 *
 * Runs on Node, which is the default and cannot be declared here: `cacheComponents` in
 * next.config.ts rejects a `runtime` segment config outright. The ranker loads an ONNX model, so
 * Edge would not work - if this route is ever moved somewhere Edge is the default, that model is
 * the reason it must not be. Held at module scope, so a cold lambda pays roughly seven seconds on
 * its first query and about a millisecond on every one after.
 *
 * No session gate, unlike /api/analyze. That route spends a user's GitHub token against a
 * repository they name, so an open one would be a proxy for someone else's credential. This route
 * reads a committed index and touches nothing per-user, so requiring a login would only stop
 * people browsing the catalogue.
 */
/** Longer than a query needs, short enough that nobody tokenises an essay. */
const MAX_QUERY = 200;

const MAX_LIMIT = 20;

function parseLimit(value: string | null): number {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) return 8;
  return Math.min(limit, MAX_LIMIT);
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = (params.get("q") ?? "").slice(0, MAX_QUERY);

  if (!query.trim()) {
    return Response.json({ query: "", results: [], semantic: true });
  }

  try {
    const { results, semantic } = await search(query, {
      limit: parseLimit(params.get("limit")),
    });

    return Response.json(
      {
        query,
        semantic,
        // Only what a row renders. The vectors and the raw match text stay on the server.
        results: results.map(({ doc, lexical, semantic: bySemantic }) => ({
          key: doc.key,
          kind: doc.kind,
          name: doc.name,
          blurb: doc.blurb,
          href: doc.href,
          context: doc.context,
          matchedOn: { lexical, semantic: bySemantic },
        })),
      },
      {
        // The index is committed, so a given query has the same answer for the life of a
        // deployment. Caching at the edge keeps the model out of the path for repeat queries.
        headers: {
          "Cache-Control":
            "public, s-maxage=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    // A stale index throws by design rather than ranking against the wrong vectors.
    console.error("Search failed.", error);
    return Response.json({ error: "Search is unavailable." }, { status: 500 });
  }
}
