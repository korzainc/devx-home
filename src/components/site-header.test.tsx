/**
 * @vitest-environment node
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "@/components/site-header";

/**
 * Runs in node rather than jsdom because the thing under test is the prerendered shell, not the
 * hydrated page. `AuthControl` reads the session and so suspends here, which is exactly the state
 * a no-JS client is left in permanently: content inside a Suspense boundary is streamed into a
 * hidden div and moved into place by an inline `$RC` call, and `$RC` never runs for them. So
 * whatever the boundary's fallback renders is the whole of what they get.
 *
 * Necessary, not sufficient. This asserts the login link is in the shell; it cannot assert the
 * link is *visible* in a browser with scripts disabled, which needs a real engine. Do not read a
 * pass here as coverage of DX-100's acceptance criteria.
 */

describe("the header shell, with the session boundary unresolved", () => {
  it("offers a way to log in", () => {
    const html = renderToString(<SiteHeader />);

    expect(html).toContain('href="/login"');
  });
});
