/**
 * @vitest-environment node
 */
import { Writable } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import GapAnalysisPage from "@/app/gap-analysis/page";

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
const analysis = vi.hoisted(() => ({
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
  gapCount: 0,
}));

const analyses = vi.hoisted(() => ({ tokens: [] as (string | null)[] }));

vi.mock("@/lib/gap/run", () => ({
  runAnalysis: async (_repo: string, token: string | null) => {
    analyses.tokens.push(token);
    return { ok: true, analysis };
  },
}));

afterEach(() => {
  session.throws = false;
  session.token = null;
  session.reads = 0;
  analyses.tokens.length = 0;
});

// Streamed, not `renderToString`: the defect lives in the streaming behaviour. Necessary but not
// sufficient -- it cannot assert visibility with scripts disabled.
async function render(node: React.ReactElement): Promise<string> {
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });

  await new Promise<void>((resolve, reject) => {
    // onShellReady, not onAllReady: flushing once everything resolves lets React inline the lot,
    // and the hidden-div path is never taken.
    const stream = renderToPipeableStream(node, {
      onShellReady() {
        stream.pipe(sink);
      },
      // Surfaced as itself, or a failing shell just hangs the render to a timeout.
      onShellError: reject,
      onError(error) {
        // Boundary errors are expected; a failure to render at all is not.
        if (!(error instanceof Error)) reject(error);
      },
    });
    sink.on("finish", resolve);
    sink.on("error", reject);
  });

  return Buffer.concat(chunks).toString("utf8");
}

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

    expect(analyses.tokens).toEqual([null]);
  });

  it("threads a signed-in reader's token through to the analysis", async () => {
    session.token = "gho_test";

    const markup = await render(page("facebook/react"));

    expect(analyses.tokens).toEqual(["gho_test"]);
    expect(markup).toContain("Style linting");
  });

  it("keeps the form when the session read throws", async () => {
    // The read sits inside the boundary, so a throw is contained and the shell still paints.
    // In the page body the same throw 500s the whole route, form included.
    session.throws = true;

    const markup = visible(await render(page("facebook/react")));

    expect(markup).toContain('value="facebook/react"');
  });
});
