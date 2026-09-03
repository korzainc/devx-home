import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  groupHits,
  SearchGroupHeading,
  type SearchHit,
} from "@/components/search-results";
import { search } from "@/lib/search/semantic";

export const metadata: Metadata = {
  title: "Search",
  description:
    "Search Korza's skills and CI tools by what you are trying to do.",
};

/**
 * The full results page.
 *
 * Two jobs. It is where the home field's form submits, so search works with JavaScript disabled
 * or still loading; and it is the overflow for a query too broad for a dropdown of eight. Ranking
 * is the same call the API route makes - the dropdown and this page can never disagree about what
 * a query means.
 */
export default function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <div className="flex flex-col gap-8">
      {/* Not async, and neither half reads searchParams here: the promise is passed down and
          awaited inside a boundary, which is what lets the shell prerender. */}
      <Suspense fallback={<HeaderShell query="" />}>
        <SearchHeader searchParams={searchParams} />
      </Suspense>
      {/* `cacheComponents` prerenders this route, so the half that reads searchParams has to sit
          behind its own boundary - the shell and the field ship as static HTML, and only the
          ranking waits on the query. */}
      <Suspense fallback={<Pending />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** The field. Also behind a boundary: `defaultValue` is the current query. */
async function SearchHeader({
  searchParams,
}: Pick<PageProps<"/search">, "searchParams">) {
  const params = await searchParams;
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  return <HeaderShell query={(raw ?? "").trim()} />;
}

/** The static half. Rendered as the fallback too, so the field is present before the query is. */
function HeaderShell({ query }: { query: string }) {
  return (
    <header className="flex max-w-2xl flex-col gap-3">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        Search
      </h1>
      {/* A GET form, so this page is usable on its own and a refined query needs no JS. */}
      <form action="/search" role="search" className="flex gap-2">
        <label htmlFor="search-q" className="sr-only">
          Describe what you are trying to do
        </label>
        <input
          id="search-q"
          key={query}
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Describe what you’re trying to do"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong"
        />
        <button
          type="submit"
          className="rounded-lg border border-accent bg-accent-wash px-4 py-2.5 text-sm font-medium whitespace-nowrap text-accent transition-opacity hover:opacity-80"
        >
          Search
        </button>
      </form>
    </header>
  );
}

/** Ranking takes a model pass, so it streams in rather than blocking the shell. */
function Pending() {
  return (
    <p role="status" className="text-sm text-ink-muted">
      Searching…
    </p>
  );
}

async function Results({
  searchParams,
}: Pick<PageProps<"/search">, "searchParams">) {
  const params = await searchParams;
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = (raw ?? "").trim();

  const { results, semantic } = query
    ? await search(query, { limit: 40 })
    : { results: [], semantic: true };

  const hits: SearchHit[] = results.map(({ doc }) => ({
    key: doc.key,
    kind: doc.kind,
    name: doc.name,
    blurb: doc.blurb,
    href: doc.href,
    context: doc.context,
  }));

  const groups = groupHits(hits);

  return (
    <>
      {query && (
        <p role="status" className="text-sm text-ink-muted">
          <span className="font-mono text-ink tabular-nums">{hits.length}</span>{" "}
          {hits.length === 1 ? "result" : "results"} for “{query}”
          {!semantic &&
            " — keyword matching only, semantic ranking is unavailable"}
        </p>
      )}

      {groups.map((group) => (
        <section key={group.label} className="flex flex-col gap-3">
          <SearchGroupHeading label={group.label} count={group.hits.length} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {group.hits.map((hit) => (
              <Link
                key={hit.key}
                href={hit.href}
                className="group flex h-full flex-col rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong hover:bg-surface-raised"
              >
                <span
                  translate="no"
                  className={
                    hit.kind === "skill"
                      ? "font-mono text-sm font-medium text-ink [overflow-wrap:anywhere]"
                      : "text-sm font-medium text-ink"
                  }
                >
                  {hit.kind === "skill" && (
                    <span className="text-accent">/</span>
                  )}
                  {hit.name}
                </span>
                {hit.blurb && (
                  <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                    {hit.blurb}
                  </p>
                )}
                <span className="mt-auto pt-3 font-mono text-[0.65rem] text-ink-faint transition-colors group-hover:text-accent">
                  {hit.context}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}

      {query && hits.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line px-6 py-12">
          <p className="text-sm text-ink">Nothing matches “{query}”.</p>
          <p className="max-w-md text-sm leading-relaxed text-ink-muted">
            Describe the task rather than naming a tool — “review a pull
            request” finds more than “PR tool” does.
          </p>
          <p className="text-sm text-ink-muted">
            Or browse{" "}
            <Link href="/skills" className="text-accent hover:underline">
              every skill
            </Link>{" "}
            and{" "}
            <Link href="/tools" className="text-accent hover:underline">
              every CI tool
            </Link>
            .
          </p>
        </div>
      )}

      {!query && (
        <p className="rounded-xl border border-dashed border-line px-6 py-12 text-sm text-ink-muted">
          Type what you are trying to do. Whole sentences work.
        </p>
      )}
    </>
  );
}
