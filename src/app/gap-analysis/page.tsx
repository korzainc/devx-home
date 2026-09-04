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
// Signed out, the token is null and the read goes out anonymously, which GitHub serves for public
// repositories. So an open source repo needs no account, and the sign-in prompt is kept for the
// two failures where logging in is the actual remedy rather than a wall in front of everyone.
//
// The token is therefore read here and not by the page. DX-100 originally hoisted it so a
// signed-out reader met the prompt in the shell; since #42 that reader gets a real report instead,
// and whether the prompt shows at all depends on how the GitHub read fails. That cannot be known
// before the round trip, so it cannot leave this boundary.
async function Result({ repo }: { repo: string }) {
  const token = await getGitHubToken();


  const baseline = getBaseline();
  const result = await runAnalysis(repo, token, { tools, baseline });

  if (!result.ok) {
    // Anonymously, 404 means no such public repo, which a private one is indistinguishable from,
    // and 429 means the shared hourly quota is spent. A signed-in reader's own token already
    // covers both, so for them these are plain errors with nothing further to offer.
    const signingInWouldHelp =
      !token && (result.status === 404 || result.status === 429);

    return signingInWouldHelp ? (
      <SignInPrompt repo={repo} reason={result.error} />
    ) : (
      <Notice>{result.error}</Notice>
    );
  }

  return <GapReport analysis={result.analysis} stacks={baseline.stacks} />;
}

// Only reached once an anonymous read has already failed, which is why it can state a reason
// rather than speculate. The reason comes from the reader, phrased for a signed-out caller:
// either no public repo of that name exists, or the shared hourly quota is used up.
function SignInPrompt({ repo, reason }: { repo: string; reason: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl border border-line bg-surface px-6 py-8 text-center">
      <Octocat className="h-7 w-7 text-ink-faint" />
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-lg font-semibold text-ink">
          Log in to analyze <span className="font-mono text-base">{repo}</span>
        </h2>
        <p className="text-sm leading-relaxed text-ink-muted">{reason}</p>
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
// typed never reaches a client that runs no script (DX-100). Nothing but the URL is read here, so
// what TTFB pays is a parse, not a query.
export const instant = false;

export default async function GapAnalysisPage({ searchParams }: Params) {
  const { repo } = await searchParams;
  const target = (Array.isArray(repo) ? repo[0] : repo)?.trim() ?? "";

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

      {/* Only the analysis stays behind a boundary. It is a GitHub round trip and belongs nowhere
          near TTFB. A client that runs no script does not see the report, and since #42 does not
          see the sign-in prompt either -- whether that shows depends on how the read fails, which
          is not knowable before making it. What such a reader gets is the form above, carrying the
          repository it was asked about. */}
      {target ? (
        <Suspense key={target} fallback={<Pending repo={target} />}>
          <Result repo={target} />
        </Suspense>
      ) : null}
    </div>
  );
}
