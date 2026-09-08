/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from "vitest";
import { SiteHeader } from "@/components/site-header";
import { renderStream } from "@/test-utils/render-stream";
import { unscriptedLogins } from "@/test-utils/noscript";

// The signed-in branch, which `site-header.test.tsx` cannot reach: there the boundary never
// resolves. Its own file because `vi.mock` is per-file. `onAllReady` so the async component
// settles; nothing else in the suite executes this branch.
//
// Both session exports are stubbed, not just the one the header uses today: a partial module
// mock leaves the other undefined, so anything reaching for it later gets a TypeError.
vi.mock("@/lib/session", () => ({
  getSession: async () => ({ user: { name: "Ada Lovelace" } }),
  getGitHubToken: async () => null,
}));

vi.mock("@/lib/auth-actions", () => ({ signOut: async () => {} }));

const render = (node: React.ReactElement) =>
  renderStream(node, { ready: "all" });

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

    expect(unscriptedLogins(markup)).toHaveLength(2);
  });
});
