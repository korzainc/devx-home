/**
 * @vitest-environment node
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "@/components/site-header";

/**
 * Runs in node rather than jsdom because the subject is the server-rendered document, not the
 * hydrated page. `AuthControl` reads the session and so suspends here, which is the state a
 * client running no script is left in permanently: a boundary's content is streamed into a
 * hidden div and moved into place by an inline `$RC` call that never runs for them.
 *
 * Necessary, not sufficient. This asserts the markup is present and outside the boundary; it
 * cannot assert it is *visible* in a browser with scripts disabled, which needs a real engine.
 * Do not read a pass here as coverage of DX-100's acceptance criteria.
 *
 * Nothing here pins the noscript markup against `LoginLink`: both read the same href, label and
 * class constants, so there is no second copy for a test to catch drifting.
 */

const html = () => renderToString(<SiteHeader />);

describe("the header, with the session boundary unresolved", () => {
  it("offers a way to log in that needs no script", () => {
    expect(html()).toMatch(
      /<noscript>[\s\S]*href="\/login"[\s\S]*<\/noscript>/,
    );
  });

  it("leaves the boundary empty rather than claiming the reader is signed out", () => {
    // Rendering the signed-out control as the fallback would show every signed-in reader
    // "Log in" for the length of the session query, measured at 300-1900ms, on every page.
    const markup = html();
    const at = markup.indexOf("<noscript>");

    // Guarded, or an absent <noscript> makes the slice below the whole document and the
    // assertion stops meaning anything.
    expect(at).toBeGreaterThan(-1);
    expect(markup.slice(0, at)).not.toContain('href="/login"');
  });
});
