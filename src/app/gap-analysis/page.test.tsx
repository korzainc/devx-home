/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import GapAnalysisPage from "@/app/gap-analysis/page";
import type { RunResult } from "@/lib/gap/run";
import type { Analysis } from "@/lib/gap/types";
import { noscriptBlocks } from "@/test-utils/noscript";
import { renderStream } from "@/test-utils/render-stream";

// Stubbed because reading the session calls `headers()`, which has no request scope here.
const session = vi.hoisted(() => ({
  throws: false,
  token: null as string | null,
  reads: 0,
}));

vi.mock("@/lib/session", () => ({
  getSession: async () => null,
  getGitHubToken: async () => {
    session.reads++;
    if (session.throws) throw new Error("DATABASE_URL is not set.");
    return session.token;
  },
}));

// Stubbed to keep the network out. What matters here is which token reaches it; since #42 a null
// one is legitimate, meaning an anonymous read.
const analysis: Analysis = vi.hoisted(() => ({
  repo: "facebook/react",
  defaultBranch: "main",
  stacks: [],
  filesRead: ["package.json"],
  categories: [
    {
      category: "Linting",
      capabilities: [
        {
          id: "lint-style",
          label: "Style linting",
          satisfied: true,
          present: [
            {
              id: "eslint",
              name: "ESLint",
              evidence: "package.json",
              stackLabels: [],
            },
          ],
          recommended: [],
        },
      ],
    },
  ],
  satisfiedCount: 1,
  partialCount: 0,
  gapCount: 0,
}));

// The whole invocation, not just the token: the form's value comes from `target` independently,
// so a mock that ignored the repo would be satisfied by `runAnalysis("wrong/repo", token)`.
const analyses = vi.hoisted(() => ({
  calls: [] as { repo: string; token: string | null }[],
  result: null as RunResult | null,
}));

vi.mock("@/lib/gap/run", () => ({
  runAnalysis: async (
    repo: string,
    token: string | null,
  ): Promise<RunResult> => {
    analyses.calls.push({ repo, token });
    return analyses.result ?? { ok: true, analysis };
  },
}));

const boundaryErrors: Error[] = [];

/** Drains what the render caught, for a test that expects a boundary to fail. */
function takeErrors(): string[] {
  const messages = boundaryErrors.map((error) => error.message);
  boundaryErrors.length = 0;
  return messages;
}

// Streamed rather than `renderToString`, because the behaviour under test is the streaming.
// Necessary but not sufficient: it cannot assert visibility with scripts disabled.
const render = (node: React.ReactElement) =>
  renderStream(node, {
    ready: "shell",
    onBoundaryError: (error) => boundaryErrors.push(error),
  });

/** What a client running no script paints: the document minus every `$RC`-filled hidden container.
 * Depth-counted, since those hold nested divs and a non-greedy match stops at the first close. */
function visible(markup: string): string {
  let out = "";
  let index = 0;

  while (index < markup.length) {
    const start = markup.indexOf("<div hidden", index);
    if (start === -1) return out + markup.slice(index);

    out += markup.slice(index, start);

    let depth = 0;
    const tag = /<div\b|<\/div>/g;
    tag.lastIndex = start;
    let match: RegExpExecArray | null;
    while ((match = tag.exec(markup)) !== null) {
      depth += match[0] === "</div>" ? -1 : 1;
      if (depth === 0) break;
    }

    index = match ? tag.lastIndex : markup.length;
  }

  return out;
}

afterEach(() => {
  session.throws = false;
  session.token = null;
  session.reads = 0;
  analyses.calls.length = 0;
  analyses.result = null;
  // Drained before asserting, or a failure here leaves the array full and every later test
  // fails with the first test's error. Any boundary error no test claimed is a crash that would
  // otherwise pass unnoticed: the form and the recorded token survive it.
  expect(takeErrors()).toEqual([]);
});

const page = (repo?: string) => (
  <GapAnalysisPage
    searchParams={Promise.resolve(repo === undefined ? {} : { repo })}
  />
);

describe("the gap-analysis page, for a client running no script", () => {
  it("shows the requested repository in the form", async () => {
    // The surviving half of DX-100's second acceptance bullet: since #42 a signed-out reader gets
    // a real report, so there is no prompt left to assert on here.
    const markup = await render(page("facebook/react"));

    expect(visible(markup)).toContain('value="facebook/react"');
  });

  it("renders the bare page without touching the session", async () => {
    // The common case from the nav, and it owes nobody a session query.
    const markup = visible(await render(page()));

    expect(markup).toContain('id="repo"');
    expect(session.reads).toBe(0);
  });

  it("analyses anonymously for a signed-out reader", async () => {
    await render(page("facebook/react"));

    expect(analyses.calls).toEqual([{ repo: "facebook/react", token: null }]);
  });

  it("threads a signed-in reader's token through to the analysis", async () => {
    session.token = "gho_test";

    // A different repo from the fixture, so a mock that ignored it could not carry this.
    const markup = await render(page("vercel/next.js"));

    expect(analyses.calls).toEqual([
      { repo: "vercel/next.js", token: "gho_test" },
    ]);
    expect(markup).toContain("Style linting");
  });

  it("does not render the report", async () => {
    // The analysis is a GitHub round trip and stays behind its boundary. Pinning its absence is
    // what stops the boundary being moved either way without a test failing.
    const raw = await render(page("facebook/react"));

    // Without this, a change to React's streaming detail makes `visible` return the document
    // unchanged, every assertion here still passes, and the simulation quietly becomes a no-op.
    expect(raw).toContain("<div hidden");
    expect(visible(raw)).not.toContain("Style linting");
  });

  it("says the report needs a script rather than leaving a pending state", async () => {
    // `Pending` alone reads as work in progress and never finishes for this reader.
    const markup = visible(await render(page("facebook/react")));

    // Per block: the greedy form this replaced would also match the word sitting between two
    // <noscript> blocks, which is the trap `noscriptBlocks` exists to close.
    expect(
      noscriptBlocks(markup).filter((block) => block.includes("JavaScript")),
    ).toHaveLength(1);
  });

  it("keeps the form when the session read throws", async () => {
    // The read sits inside the boundary, so a throw is contained and the shell still paints.
    // In the page body the same throw 500s the whole route, form included.
    session.throws = true;

    const markup = visible(await render(page("facebook/react")));

    expect(markup).toContain('value="facebook/react"');
    expect(takeErrors()).toEqual(["DATABASE_URL is not set."]);
  });

  it("offers a login when an anonymous read fails in a way that a login would fix", async () => {
    // `signingInWouldHelp` in the page: only a signed-out 404 or 429 earns the prompt. Subtle
    // enough to have produced a live bug already, per its own comment on 403.
    analyses.result = {
      ok: false,
      status: 404,
      error: "No such public repository.",
    };

    const markup = await render(page("facebook/react"));

    expect(markup).toContain("Log in to analyze");
  });

  it("shows a plain notice when a login would not help", async () => {
    session.token = "gho_test";
    analyses.result = { ok: false, status: 404, error: "No such repository." };

    const markup = await render(page("facebook/react"));

    expect(markup).toContain("No such repository.");
    expect(markup).not.toContain("Log in to analyze");
  });
});
