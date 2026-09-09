/**
 * @vitest-environment node
 */
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SiteHeader } from "@/components/site-header";
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

describe("the header, with the session boundary unresolved", () => {
  it("offers a way to log in that needs no script", () => {
    expect(unscriptedLogins(html()).length).toBeGreaterThan(0);
  });

  it("offers one inside each viewport's own container", () => {
    // `hidden sm:flex` against `sm:hidden`, so exactly one container is ever on screen. Counting
    // two links is not enough: both can sit in the wide nav, and a phone loses login entirely
    // while every assertion stays green.
    const markup = html();
    const within = (tag: "nav" | "details") => {
      const start = markup.indexOf(`<${tag}`);
      return markup.slice(start, markup.indexOf(`</${tag}>`, start));
    };

    expect(unscriptedLogins(within("nav"))).toHaveLength(1);
    expect(unscriptedLogins(within("details"))).toHaveLength(1);
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
