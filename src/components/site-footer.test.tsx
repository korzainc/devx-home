/**
 * @vitest-environment node
 */
import { readdirSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "@/components/site-footer";

/**
 * The footer is the site's navigation, so the thing worth testing is coverage, not markup.
 *
 * `/gap-analysis` shipped with no link anywhere: you reached it by submitting the repo form on the
 * home page, and a reader who had run one could not get back to it. This walks the route folders
 * so the next page added that way fails here rather than going unnoticed.
 */

// Route folders a reader is not meant to navigate to by name.
const UNLISTED = new Set([
  "api", // route handlers
  "setup", // the install script, a route handler
  "scrap", // throwaway design sketches
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
