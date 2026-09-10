/**
 * @vitest-environment node
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SiteHeader } from "@/components/site-header";
import { PRODUCTS } from "@/lib/nav";
import { unscriptedLogins } from "@/test-utils/noscript";

// A session that never settles, so the boundary is genuinely pending -- which is where a client
// running no script is left permanently. Left unmocked it would throw instead, for want of a
// request scope, and the null fallback would arrive by the error path: the same markup for the
// wrong reason, and a suite that keeps passing even if the session query became instant.
vi.mock("@/lib/session", () => ({
  getSession: () => new Promise(() => {}),
}));

// Node, not jsdom: the subject is the server-rendered document. Necessary but not sufficient --
// presence and position only, never visibility, which needs a real engine.
const html = () => renderToString(<SiteHeader />);

/**
 * The two containers, `hidden sm:flex` against `sm:hidden`, so exactly one is ever on screen.
 *
 * The narrow one is found by its `sm:hidden` marker rather than by being the first `details` in
 * the markup: the wide row's Products dropdown is a `details` too, and it comes first, so reading
 * by position quietly started returning the wrong panel.
 */
function containers() {
  const markup = html();
  const wideStart = markup.indexOf("<nav");
  const narrow = [...markup.matchAll(/<details[^>]*>/g)].find((tag) =>
    tag[0].includes("sm:hidden"),
  );

  if (!narrow) throw new Error("the header has no narrow-width menu");

  return {
    wide: markup.slice(wideStart, markup.indexOf("</nav>", wideStart)),
    narrow: markup.slice(
      narrow.index,
      markup.indexOf("</details>", narrow.index),
    ),
  };
}

describe("the header, with the session boundary unresolved", () => {
  it("offers a way to log in that needs no script", () => {
    expect(unscriptedLogins(html()).length).toBeGreaterThan(0);
  });

  it("offers one inside each viewport's own container", () => {
    // Counting two links across the whole header is not enough: both can sit in the wide nav,
    // and a phone loses login entirely while every assertion stays green.
    const { wide, narrow } = containers();

    expect(unscriptedLogins(wide)).toHaveLength(1);
    expect(unscriptedLogins(narrow)).toHaveLength(1);
  });

  // The wide row reaches these through a dropdown and the narrow one lists them flat, but a
  // product missing from either viewport is unreachable from the bar on that viewport.
  it("reaches every product from both containers", () => {
    const { wide, narrow } = containers();

    for (const product of PRODUCTS) {
      expect(wide, `${product.href} is missing from the wide row`).toContain(
        `href="${product.href}"`,
      );
      expect(narrow, `${product.href} is missing from the menu`).toContain(
        `href="${product.href}"`,
      );
    }
  });

  it("leaves the boundary empty rather than claiming the reader is signed out", () => {
    // The signed-out control as fallback would show every signed-in reader "Log in" for the
    // 300-1900ms the session query takes, on every page. Asserted by removing the <noscript>
    // blocks and requiring nothing else offers a login: slicing at the first <noscript> instead
    // only ever covered the nav links, so the fallback could be restored and this still passed.
    const withoutNoscript = html().replace(
      /<noscript>[\s\S]*?<\/noscript>/g,
      "",
    );

    expect(withoutNoscript).not.toContain('href="/login"');
  });
});
