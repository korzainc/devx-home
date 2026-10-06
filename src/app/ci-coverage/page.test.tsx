/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Children, isValidElement, Suspense } from "react";
import { AnalysisUsage } from "@/components/analysis-usage";
import { Writable } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import CiCoveragePage from "@/app/ci-coverage/page";
import type { RunResult } from "@/lib/gap/run";
import type { Analysis } from "@/lib/gap/types";
import { noscriptBlocks } from "@/test-utils/noscript";
import { renderStream } from "@/test-utils/render-stream";

const afterResponse = vi.hoisted(() => [] as (() => Promise<void>)[]);
const afterTaskErrors = vi.hoisted(() => [] as unknown[]);
vi.mock("next/server", () => ({
  connection: async () => {},
  after: (task: Promise<void> | (() => Promise<void>)) => {
    const observe = (promise: Promise<void>) =>
      promise.catch((error) => {
        afterTaskErrors.push(error);
      });
    // Match Next's AfterContext: promises are observed immediately; callbacks
    // only begin after the response. Either reports errors without rejecting waitUntil.
    if (typeof task === "function") afterResponse.push(() => observe(task()));
    else {
      const observed = observe(task);
      afterResponse.push(() => observed);
    }
  },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/membership", () => ({ isOrgMember: async () => true }));

// Stubbed because reading the session calls `headers()`, which has no request scope here.
const session = vi.hoisted(() => ({
  throws: false,
  token: null as string | null,
  reads: 0,
  signedIn: false,
}));

vi.mock("@/lib/session", () => ({
  getSession: async () =>
    session.signedIn ? { user: { id: "member" } } : null,
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

const usage = vi.hoisted(() => vi.fn());
const record = vi.hoisted(() => vi.fn());
const fixPrompts = vi.hoisted(() => [] as string[]);
vi.mock("@/components/fix-prompt", () => ({
  FixPromptButton: ({ prompt }: { prompt: string }) => {
    fixPrompts.push(prompt);
    return null;
  },
}));
vi.mock("@/lib/analysis-usage", async (original) => ({
  ...(await original<typeof import("@/lib/analysis-usage")>()),
  readAnalysisUsage: usage,
  recordAnalysisRun: record,
}));

vi.mock("@/lib/gap/run", () => ({
  runAnalysis: async (
    repo: string,
    token: string | null,
  ): Promise<RunResult> => {
    analyses.calls.push({ repo, token });
    return analyses.result ?? { ok: true, analysis, repoId: 42 };
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
  session.signedIn = false;
  analyses.calls.length = 0;
  analyses.result = null;
  usage.mockReset();
  record.mockReset();
  fixPrompts.length = 0;
  afterResponse.length = 0;
  // Drained before asserting, or a failure here leaves the array full and every later test
  // fails with the first test's error. Any boundary error no test claimed is a crash that would
  // otherwise pass unnoticed: the form and the recorded token survive it.
  expect(takeErrors()).toEqual([]);
  expect(afterTaskErrors.splice(0)).toEqual([]);
});

const sharedRunId = "12345678-1234-1234-1234-123456789abc";
const page = (repo?: string, run = sharedRunId) => (
  <CiCoveragePage
    searchParams={Promise.resolve(repo === undefined ? {} : { repo, run })}
  />
);

describe("the CI coverage page, for a client running no script", () => {
  it("shows the requested repository in the form", async () => {
    // The surviving half of DX-100's second acceptance bullet: since #42 a signed-out reader gets
    // a real report, so there is no prompt left to assert on here.
    const markup = await render(page("facebook/react"));

    expect(visible(markup)).toContain('value="facebook/react"');
  });

  it("renders the bare form without requesting a GitHub token", async () => {
    const markup = visible(await render(page()));

    expect(markup).toContain('id="repo"');
    expect(session.reads).toBe(0);
    expect(afterResponse).toHaveLength(0);
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
    const [block, ...rest] = noscriptBlocks(markup).filter((b) =>
      b.includes("JavaScript"),
    );
    expect(rest).toEqual([]);
    expect(block).toBeDefined();

    // The suppression is the point of the change, so it is read back off the paragraph it has to
    // suppress rather than asserted as a literal. Hardcoding the class here would let a typo on
    // either side pass while a no-script reader gets the breathing ellipsis again.
    const suppressed = markup.match(/<p class="([^" ]+)[^"]*">Reading/)?.[1];
    expect(suppressed).toBeDefined();
    expect(block).toContain(`.${suppressed}{display:none}`);
  });

  it("keeps the form when the session read throws", async () => {
    // The read sits inside the boundary, so a throw is contained and the shell still paints.
    // In the page body the same throw 500s the whole route, form included.
    session.throws = true;

    const markup = visible(await render(page("facebook/react")));

    expect(markup).toContain('value="facebook/react"');
    expect(takeErrors()).toEqual(["DATABASE_URL is not set."]);
    await Promise.all(afterResponse.map((callback) => callback()));
    expect(record).not.toHaveBeenCalled();
  });
});

// Separate, because both of these live inside the boundary: a client running no script sees
// neither. They pin the server's output, which is a different subject from the suite above.
describe("the CI coverage page, once the analysis resolves", () => {
  it("includes the real bundle recipe in a recommended fix prompt", async () => {
    analyses.result = {
      ok: true,
      repoId: 42,
      analysis: {
        ...analysis,
        satisfiedCount: 0,
        gapCount: 1,
        categories: [
          {
            category: "Security",
            capabilities: [
              {
                id: "secrets",
                label: "Secrets scanning",
                satisfied: false,
                present: [],
                recommended: [
                  {
                    id: "ci-base-checks",
                    name: "Korza CI Base Checks",
                    stackLabels: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    await render(page("facebook/react"));

    expect(fixPrompts).toHaveLength(1);
    expect(fixPrompts[0]).toContain("korzacitools.azurecr.io/ci-common:");
    expect(fixPrompts[0]).toContain("ci-run scan --out /out");
    expect(fixPrompts[0]).toContain("ci-run report --in /out");
  });

  it("keeps public analysis available without exposing or reading aggregate usage", async () => {
    usage.mockResolvedValue({ runs: 413, repositories: 97 });

    const bare = await render(page());
    const report = await render(page("facebook/react"));

    expect(bare).toContain('id="repo"');
    expect(report).toContain("Style linting");
    expect(bare).not.toContain('aria-label="Site-wide analysis usage"');
    expect(report).not.toContain('aria-label="Site-wide analysis usage"');
    expect(usage).not.toHaveBeenCalled();
  });

  it("retains a shared run's identity but assigns a new identity to another Analyze submission", async () => {
    const first = await render(page("facebook/react"));
    const shared = await render(page("facebook/react"));
    const nextRun = first.match(/name="run" value="([^"]+)"/)?.[1];
    const sharedNextRun = shared.match(/name="run" value="([^"]+)"/)?.[1];

    expect(nextRun).toMatch(/^[0-9a-f-]{36}$/);
    expect(nextRun).not.toBe(sharedRunId);
    expect(sharedNextRun).not.toBe(sharedRunId);
    expect(sharedNextRun).not.toBe(nextRun);
    await render(page("facebook/react", nextRun));

    // Opening the same URL is one logical run; choosing Analyze is another.
    expect(record).toHaveBeenCalledTimes(3);
    expect(afterResponse).toHaveLength(3);
    await Promise.all(afterResponse.map((callback) => callback()));
    expect(record.mock.calls).toEqual([
      [sharedRunId, 42],
      [sharedRunId, 42],
      [nextRun, 42],
    ]);
  });

  it("keeps one reserved usage slot below the description on both the bare and result pages", async () => {
    for (const repo of [undefined, "facebook/react"]) {
      const tree = await CiCoveragePage({
        searchParams: Promise.resolve(repo ? { repo, run: sharedRunId } : {}),
      });
      const header = Children.toArray(tree.props.children)[0];
      expect(isValidElement(header) && header.type).toBe("header");
      if (!isValidElement<{ children: React.ReactNode }>(header))
        throw new Error("Missing header");
      const children = Children.toArray(header.props.children);
      expect(
        children.map((child) => isValidElement(child) && child.type),
      ).toEqual(["h1", "p", "div"]);
      const slot = children[2];
      if (
        !isValidElement<{
          className: string;
          children: React.ReactElement<{
            fallback: React.ReactNode;
            children: React.ReactElement;
          }>;
        }>(slot)
      )
        throw new Error("Missing usage slot");
      expect(slot.props.className.split(" ")).toEqual(
        expect.arrayContaining(["min-h-10", "sm:min-h-5"]),
      );
      expect(slot.props.children.type).toBe(Suspense);
      expect(slot.props.children.props.fallback).toBeNull();
      expect(slot.props.children.props.children.type).toBe(AnalysisUsage);
    }
    await Promise.all(afterResponse.map((callback) => callback()));
  });

  it("streams the report while recording and then reading fresh member totals are each pending", async () => {
    session.signedIn = true;
    let finishRecording!: () => void;
    record.mockReturnValue(
      new Promise<void>((resolve) => (finishRecording = resolve)),
    );
    let finishUsage!: (value: { runs: number; repositories: number }) => void;
    usage.mockReturnValue(new Promise((resolve) => (finishUsage = resolve)));
    let markup = "";
    const output = new Writable({
      write(chunk, _encoding, done) {
        markup += chunk.toString();
        done();
      },
    });
    const finished = new Promise<void>((resolve, reject) => {
      output.on("finish", resolve);
      output.on("error", reject);
    });
    const stream = renderToPipeableStream(page("facebook/react"), {
      onShellReady: () => stream.pipe(output),
      onError: (error) => {
        boundaryErrors.push(error as Error);
      },
    });

    try {
      await vi.waitFor(() => {
        expect(record).toHaveBeenCalledWith(sharedRunId, 42);
        const reportBoundary = markup
          .replace(/<!--.*?-->/g, "")
          .match(
            /<template id="([^"]+)"[^>]*><\/template><p[^>]*>Reading facebook\/react/,
          )?.[1];
        expect(reportBoundary).toBeDefined();
        // Hidden report bytes alone do not prove that the client can see them.
        expect(markup).toContain(`$RC("${reportBoundary}"`);
        expect(markup).toContain("Style linting");
      });
      expect(usage).not.toHaveBeenCalled();
      expect(markup).not.toContain('aria-label="Site-wide analysis usage"');
      expect(afterResponse).toHaveLength(1);
      expect(analyses.calls).toEqual([{ repo: "facebook/react", token: null }]);

      finishRecording();
      await vi.waitFor(() => expect(usage).toHaveBeenCalledOnce());
      expect(markup).toContain("Style linting");
      expect(markup).not.toContain('aria-label="Site-wide analysis usage"');
    } finally {
      finishRecording();
      finishUsage({ runs: 413, repositories: 97 });
      await finished;
    }
    expect(markup.replace(/<!--.*?-->/g, "")).toContain(
      "Analysed 97 repositories across 413 runs",
    );
    expect(markup.match(/aria-label="Site-wide analysis usage"/g)).toHaveLength(
      1,
    );
    await afterResponse[0]();
    expect(record).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "observes recording rejection immediately without interrupting the report (signed in: %s)",
    async (signedIn) => {
      session.signedIn = signedIn;
      const error = new Error("unexpected recorder failure");
      record.mockRejectedValue(error);

      const markup = await render(page("facebook/react"));

      expect(markup).toContain("Style linting");
      expect(markup).not.toContain('aria-label="Site-wide analysis usage"');
      expect(usage).not.toHaveBeenCalled();
      expect(record).toHaveBeenCalledWith(sharedRunId, 42);
      // No post-response drain has run: a signed-out usage gate cannot be the
      // rejection observer, so after must attach one when it receives the promise.
      expect(afterTaskErrors.splice(0)).toEqual([error]);
      expect(afterResponse).toHaveLength(1);
      await expect(afterResponse[0]()).resolves.toBeUndefined();
    },
  );

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
    await Promise.all(afterResponse.map((callback) => callback()));
    expect(record).not.toHaveBeenCalled();
  });

  it("shows a plain notice when a login would not help", async () => {
    session.token = "gho_test";
    analyses.result = { ok: false, status: 404, error: "No such repository." };

    const markup = await render(page("facebook/react"));

    expect(markup).toContain("No such repository.");
    expect(markup).not.toContain("Log in to analyze");
    await Promise.all(afterResponse.map((callback) => callback()));
    expect(record).not.toHaveBeenCalled();
  });
});
