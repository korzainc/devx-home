/**
 * @vitest-environment node
 */
import { Writable } from "node:stream";
import { renderToPipeableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SiteHeader } from "@/components/site-header";

// The signed-in branch, which `site-header.test.tsx` cannot reach: there the boundary never
// resolves. Its own file because `vi.mock` is per-file. `onAllReady` so the async component
// settles; nothing else in the suite executes this branch.
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
    // Static markup, so a signed-in reader with scripts off is still offered "Log in". Wrong,
    // and deliberate: the alternative shows it to everyone while the session resolves.
    const markup = await render(<SiteHeader />);

    expect(markup).toMatch(
      /<noscript>[\s\S]*href="\/login"[\s\S]*<\/noscript>/,
    );
  });
});
