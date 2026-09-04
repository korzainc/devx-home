/**
 * @vitest-environment node
 */
import { Writable } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import GapAnalysisPage from "@/app/gap-analysis/page";

// Reading the session calls `headers()`, which needs a request scope this renderer does not
// provide. Only the session is stubbed -- the page's own structure, which is what is under test,
// runs for real. Null is the signed-out answer, and the one the acceptance criteria name.
const session = vi.hoisted(() => ({
  throws: false,
  token: null as string | null,
}));

vi.mock("@/lib/session", () => ({
  getSession: async () => null,
  getGitHubToken: async () => {
    // What a missing DATABASE_URL, or an unreachable auth store, actually does.
    if (session.throws) throw new Error("DATABASE_URL is not set.");
    return session.token;
  },
}));

// Stubbed so the signed-in path can run without a network call. `analyze` itself is covered by
// its own tests; what is under test here is that the page hands the token to `Result` and the
// report comes back.
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

vi.mock("@/lib/gap/run", () => ({
  runAnalysis: async (_repo: string, token: string) => {
    if (!token) throw new Error("Result was rendered without a token.");
    return { ok: true, analysis };
  },
}));

afterEach(() => {
  session.throws = false;
  session.token = null;
});

/**
 * Streams the page the way the server does, rather than `renderToString`, because the defect
 * lives in the streaming behaviour: a boundary's content is written into a `<div hidden>` at the
 * end of the document and moved into place by an inline `$RC` call. A client running no script
 * never sees it, so only what lands outside those containers is real.
 *
 * `Result` calls `headers()`, which has no request scope here, so that boundary errors. That is
 * fine and deliberate -- this asserts on the shell around it, which is the part under test.
 *
 * Necessary, not sufficient: it cannot assert visibility in a browser with scripts disabled.
 */

async function render(node: React.ReactElement): Promise<string> {
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });

  await new Promise<void>((resolve, reject) => {
    // onShellReady, not onAllReady: flushing only once everything has resolved lets React inline
    // the lot and the hidden-div path is never taken, so the defect cannot reproduce.
    const stream = renderToPipeableStream(node, {
      onShellReady() {
        stream.pipe(sink);
      },
      onShellError(error) {
        // The shell failing is the production symptom under test -- the whole route 500s and
        // takes the form with it. Surfaced as itself, or the render just hangs to a timeout.
        reject(error);
      },
      onError(error) {
        // Boundary-level errors are expected here; a failure to render at all is not.
        if (!(error instanceof Error)) reject(error);
      },
    });
    sink.on("finish", resolve);
    sink.on("error", reject);
  });

  return Buffer.concat(chunks).toString("utf8");
}

/** What a client that runs no script actually paints: the document minus every hidden container
 * whose contents only arrive via `$RC`. Depth-counted rather than regex-matched, since those
 * containers hold nested divs and a non-greedy match would stop at the first close tag. */
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

const page = (repo: string) => (
  <GapAnalysisPage searchParams={Promise.resolve({ repo })} />
);

describe("the gap-analysis page, for a client running no script", () => {
  it("shows the requested repository in the form", async () => {
    const markup = await render(page("facebook/react"));

    expect(visible(markup)).toContain('value="facebook/react"');
  });

  it("shows a signed-out reader the sign-in prompt, naming the repository", async () => {
    const markup = visible(await render(page("facebook/react")));

    // Scoped to the prompt's own heading. A bare `toContain` for the repository would pass on
    // the form's value attribute alone, with no prompt rendered at all.
    expect(markup).toMatch(/Log in to analyze[^<]*<[^>]*>facebook\/react</);
  });

  it("hands the token to the report for a signed-in reader", async () => {
    // The page reads the token and passes it down, so this is the only coverage `Result`'s
    // signature has -- nothing else in the suite renders the signed-in branch.
    session.token = "gho_test";

    const markup = await render(page("facebook/react"));

    expect(markup).toContain("Style linting");
    expect(markup).not.toContain("Log in to analyze");
  });

  it("still renders the form when the session store is unreachable", async () => {
    // The read is in the page body now, so an exception there takes the whole route down --
    // including the form, which is the part DX-100 exists to keep reachable.
    session.throws = true;

    const markup = visible(await render(page("facebook/react")));

    expect(markup).toContain('value="facebook/react"');
    expect(markup).toContain("Log in to analyze");
  });
});
