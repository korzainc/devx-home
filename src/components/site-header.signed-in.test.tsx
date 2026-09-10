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
  getSession: async () => ({
    user: {
      name: "Ada Lovelace",
      email: "ada@korza.ai",
      image: "https://avatars.githubusercontent.com/u/21181916?v=4",
    },
  }),
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

  it("draws the GitHub avatar, at the size the header uses", async () => {
    const markup = await render(<SiteHeader />);

    // Not the 460px the bare URL serves. The header draws it at 32px.
    expect(markup).toContain("avatars.githubusercontent.com");
    expect(markup).toContain("s=64");
  });

  // Twice, because the header draws the account block in the wide row and again inside the
  // narrow-width menu. Only one is ever visible, and `getSession` is memoised, so this is one
  // query drawing two copies rather than a duplicate the markup should not have.
  it("draws the account block once for each breakpoint", async () => {
    const markup = await render(<SiteHeader />);

    expect(markup.split("Ada Lovelace")).toHaveLength(3);
    expect(markup.split("Log out")).toHaveLength(3);
  });

  // The wide copy hides the name behind the avatar, so the menu is the only thing that says which
  // login you are on. An avatar alone cannot tell two accounts with the same photo apart.
  it("names the account and its email inside the menu", async () => {
    const markup = await render(<SiteHeader />);

    expect(markup).toContain("ada@korza.ai");
  });

  it("still carries the unscripted login link, which cannot know who they are", async () => {
    // Static markup, so a signed-in reader with scripts off is still offered "Log in". Wrong,
    // and deliberate: the alternative shows it to everyone while the session resolves.
    const markup = await render(<SiteHeader />);

    expect(unscriptedLogins(markup)).toHaveLength(2);
  });
});
