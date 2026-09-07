/**
 * @vitest-environment node
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "@/components/site-header";

// Node, not jsdom: the subject is the server-rendered document. `AuthControl` suspends here,
// which is where a client running no script is left permanently. Necessary but not sufficient --
// presence and position only, never visibility, which needs a real engine.
const html = () => renderToString(<SiteHeader />);

describe("the header, with the session boundary unresolved", () => {
  it("offers a way to log in that needs no script", () => {
    expect(html()).toMatch(
      /<noscript>[\s\S]*href="\/login"[\s\S]*<\/noscript>/,
    );
  });

  it("offers one at each viewport, since the two are mutually exclusive", () => {
    // `hidden sm:flex` against `sm:hidden`, so each viewport needs its own copy. Asserting only
    // that some <noscript> exists let the narrow one be deleted with nothing failing.
    const blocks = [
      ...html().matchAll(/<noscript>([\s\S]*?)<\/noscript>/g),
    ].filter(([, inner]) => inner.includes('href="/login"'));

    expect(blocks).toHaveLength(2);
  });

  it("leaves the boundary empty rather than claiming the reader is signed out", () => {
    // The signed-out control as fallback would show every signed-in reader "Log in" for the
    // 300-1900ms the session query takes, on every page.
    const markup = html();
    const at = markup.indexOf("<noscript>");

    // Guarded, or an absent <noscript> slices the whole document and asserts nothing.
    expect(at).toBeGreaterThan(-1);
    expect(markup.slice(0, at)).not.toContain('href="/login"');
  });
});
