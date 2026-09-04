import type { Metadata } from "next";
import { Suspense } from "react";
import { GapReport } from "@/components/gap-report";
import { Octocat } from "@/components/octocat";
import { signInWithGitHub } from "@/lib/auth-actions";
import { getBaseline, tools } from "@/lib/catalogue";
import { runAnalysis } from "@/lib/gap/run";
import { getGitHubToken } from "@/lib/session";

export const metadata: Metadata = {
  title: "Gap analysis",
  description:
    "Point it at a GitHub repository. It reads the manifests and CI config, then reports which recommended checks are missing.",
};

// The token belongs to whoever is signed in and is handed to `runAnalysis` as an argument.
// Nothing under src/lib/gap touches the environment or the session.
//
// The token is read by the page rather than here, so that a signed-out reader gets the prompt in
// the shell instead of behind this boundary. Only the GitHub round trip is left inside it.
async function Result({ repo, token }: { repo: string; token: string }) {
  const baseline = getBaseline();
  const result = await runAnalysis(repo, token, { tools, baseline });
  if (!result.ok) return <Notice>{result.error}</Notice>;

  return <GapReport analysis={result.analysis} stacks={baseline.stacks} />;
}

// Shown whenever nobody is signed in, so it cannot say anything about the repository itself.
// Whether it is private, or exists at all, is unknown until a request carries a token.
function SignInPrompt({ repo }: { repo: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-line bg-surface px-6 py-8 text-center">
      <Octocat className="h-7 w-7 text-ink-faint" />
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">
          Log in to analyze <span className="font-mono text-base">{repo}</span>
        </h2>
        <p className="text-sm leading-relaxed text-ink-muted">
          Korza DevX reads the repository with your own GitHub access, so the
          report never shows you anything you could not already open on GitHub.
        </p>
      </div>
      <form action={signInWithGitHub}>
        {/* Without this the callback lands on the home page and the repo just typed is lost. */}
        <input
          type="hidden"
          name="next"
          value={`/gap-analysis?repo=${encodeURIComponent(repo)}`}
        />
        <button
          type="submit"
          className="mt-1 inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-canvas transition-opacity hover:opacity-85"
        >
          <Octocat />
          Log in with GitHub
        </button>
      </form>
      <p className="text-xs text-ink-faint">Read only. File contents only.</p>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-accent bg-accent-wash px-5 py-4 text-center text-sm text-ink">
      {children}
    </p>
  );
}

function Pending({ repo }: { repo: string }) {
  return (
    <p className="font-mono text-sm text-ink-faint">
      Reading {repo}
      <span className="animate-breathe">...</span>
    </p>
  );
}

function RepoForm({ target }: { target: string }) {
  return (
    <form className="flex flex-col gap-2">
      <label htmlFor="repo" className="text-xs font-medium text-ink-faint">
        Repository
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        {/* Same guard as the home page field: submitting this empty used to reload the page
            onto itself with nothing to show for it. */}
        <input
          id="repo"
          name="repo"
          defaultValue={target}
          placeholder="korzainc/devx-home"
          required
          pattern=".*\S.*"
          title="A GitHub repository, as owner/repo or a full github.com URL."
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm text-ink placeholder:text-ink-faint"
        />
        <button
          type="submit"
          className="rounded-lg border border-accent bg-accent-wash px-4 py-2 text-sm font-medium whitespace-nowrap text-accent transition-opacity hover:opacity-80"
        >
          Analyze
        </button>
      </div>
    </form>
  );
}

type Params = Pick<PageProps<"/gap-analysis">, "searchParams">;

// The home page posts its field here as a plain GET, so arriving with `?repo=` runs the analysis
// on the server before anything reaches the browser.
//
// `searchParams` is awaited in the page body rather than inside a boundary, which costs this route
// its static shell -- hence `instant = false`, which opts the segment out of the static-shell
// validation Cache Components runs. The trade is deliberate: a boundary's content is written into
// a `<div hidden>` and moved into place by an inline `$RC` call, so behind one the repository just
// typed never reaches a client that runs no script (DX-100). What is bought is one session query
// on TTFB, not the GitHub round trip, which stays behind the boundary below.
export const instant = false;

export default async function GapAnalysisPage({ searchParams }: Params) {
  const { repo } = await searchParams;
  const target = (Array.isArray(repo) ? repo[0] : repo)?.trim() ?? "";
  // Only when there is something to analyse: the bare page owes nobody a session query.
  //
  // Caught, because this read is in the page body: an exception here fails the shell and takes
  // the whole route down, form included, which is what this page was changed to keep reachable.
  // Behind a boundary it could only have spoiled the report. Treating a failure as signed out
  // follows `getGitHubToken`'s own contract -- it already returns null for an expired grant on
  // the grounds that the remedy is the same button either way, and so it is here.
  const token = target ? await getGitHubToken().catch(() => null) : null;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex max-w-2xl flex-col gap-3">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Gap analysis
        </h1>
        <p className="leading-relaxed text-ink-muted">
          Give it a GitHub repository and it reads the manifests and CI config
          through the API, then compares what runs against what the catalogue
          expects for the stacks it finds. Every result names the file it came
          from, so you can check the reasoning, and every recommendation is
          backed by Korza&apos;s real catalogue.
        </p>
      </header>

      <RepoForm target={target} />

      {/* Only the analysis stays behind a boundary. It is a GitHub round trip and belongs
          nowhere near TTFB, and a client that cannot see it still has the form and, when signed
          out, the prompt -- both of which are in the shell. */}
      {target && token ? (
        <Suspense key={target} fallback={<Pending repo={target} />}>
          <Result repo={target} token={token} />
        </Suspense>
      ) : null}
      {target && !token ? <SignInPrompt repo={target} /> : null}
    </div>
  );
}
