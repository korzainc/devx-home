/**
 * @vitest-environment node
 */
import { readdirSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "@/components/site-footer";

/**
 * The bar carries one link, so the footer is where every page is named and coverage is the thing
 * worth testing, not markup.
 *
 * This walks the route folders rather than a written-out list, because the failure it is for is a
 * page that nothing links to. `/ci-coverage` was reachable only by submitting the repo form on the
 * home page, and a reader who had run one could not get back to it; a list would have been written
 * to match the footer and agreed with it.
 */

// Route folders a reader is not meant to navigate to by name.
const UNLISTED = new Set([
  "api", // route handlers
  "setup", // the install script, a route handler
  "login", // the header's own control, and only for the signed out
]);

const routes = readdirSync("src/app", { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !UNLISTED.has(entry.name))
  .map((entry) => `/${entry.name}`);

describe("the footer", () => {
  it("has a route folder to cover", () => {
    // Guards the walk itself: a bad path would make every assertion below vacuously true.
    expect(routes.length).toBeGreaterThan(4);
  });

  it("links every page the site has", () => {
    const markup = renderToString(<SiteFooter />);

    for (const route of routes) {
      expect(markup, `${route} is reachable from nowhere`).toContain(
        `href="${route}"`,
      );
    }
  });

  // Not a Link: prefetching a GitHub page on hover is wasted work, and Next would try.
  it("sends the outbound link straight out", () => {
    expect(renderToString(<SiteFooter />)).toContain(
      'href="https://github.com/korzainc/devx-home"',
    );
  });
});
