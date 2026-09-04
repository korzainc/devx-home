/**
 * @vitest-environment node
 */
import { Writable } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SiteHeader } from "@/components/site-header";

/**
 * The signed-in branch, which `site-header.test.tsx` cannot reach: there the session boundary
 * never resolves, which is the point of that file. Separate rather than a second `describe`,
 * because `vi.mock` is per-file.
 *
 * Streamed with `onAllReady` so the async component resolves; the shell-versus-hidden-div
 * question is the other file's subject, not this one's. What this covers is that the branch
 * renders at all -- nothing else in the suite executes it.
 */
vi.mock("@/lib/session", () => ({
  getSession: async () => ({ user: { name: "Ada Lovelace" } }),
}));

vi.mock("@/lib/auth-actions", () => ({
  signOut: async () => {},
  signInWithGitHub: async () => {},
}));

async function render(node: React.ReactElement): Promise<string> {
  const chunks: Buffer[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });

  await new Promise<void>((resolve, reject) => {
    const stream = renderToPipeableStream(node, {
      onAllReady() {
        stream.pipe(sink);
      },
      onShellError: reject,
      onError: reject,
    });
    sink.on("finish", resolve);
    sink.on("error", reject);
  });

  return Buffer.concat(chunks).toString("utf8");
}

describe("the header, for a signed-in reader", () => {
  it("names them and offers a way out", async () => {
    const markup = await render(<SiteHeader />);

    expect(markup).toContain("Ada Lovelace");
    expect(markup).toContain("Log out");
  });

  it("still carries the unscripted login link, which cannot know who they are", async () => {
    // The <noscript> is static markup rendered regardless of session, so a reader with scripts
    // off sees "Log in" even when signed in. Wrong, and deliberate: the alternative is showing
    // it to everyone for the length of the session query. Pinned so the trade stays visible.
    const markup = await render(<SiteHeader />);

    expect(markup).toMatch(
      /<noscript>[\s\S]*href="\/login"[\s\S]*<\/noscript>/,
    );
  });
});
