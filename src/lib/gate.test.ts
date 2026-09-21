import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isOpenPath } from "./gate";

/**
 * `isOpenPath` is the whole security boundary now that the portal has no VPN in front of it, so
 * this is less about the function than about the list inside it. The walk at the bottom is the
 * part worth having: a page added later is gated by default, and this fails if somebody opens one
 * without saying so here.
 */

describe("the gate", () => {
  it("opens the way in", () => {
    // Or the redirect has nowhere to send anybody, and the callback cannot land.
    expect(isOpenPath("/login")).toBe(true);
    expect(isOpenPath("/api/auth")).toBe(true);
    expect(isOpenPath("/api/auth/callback/github")).toBe(true);
  });

  it("opens the page the turned-away land on", () => {
    // Its reader holds a session and still fails the gate, so gating it is an infinite redirect.
    expect(isOpenPath("/no-access")).toBe(true);
  });

  it("closes the pages", () => {
    for (const path of ["/", "/tools", "/skills", "/roadmap", "/updates"]) {
      expect(isOpenPath(path), `${path} answers without a session`).toBe(false);
    }
  });

  it("closes the analysis endpoint", () => {
    // `/api/analyze` spends the shared GitHub quota, and `/api/auth` being open must not carry
    // the rest of `/api` with it.
    expect(isOpenPath("/api/analyze")).toBe(false);
  });

  it("opens the installer, which is fetched by curl and carries no cookie", () => {
    expect(isOpenPath("/setup")).toBe(true);
    expect(isOpenPath("/korza/install.sh")).toBe(true);
    expect(isOpenPath("/korza/release.json")).toBe(true);
    // The script fetches both, so gating either leaves an install that starts and cannot finish.
    expect(isOpenPath("/korza/korza-0.1.0-macos.tar.gz")).toBe(true);
    expect(isOpenPath("/korza/korza-0.1.0-macos.tar.gz.sha256")).toBe(true);
  });

  it("opens the anonymous coverage report but not the endpoint", () => {
    // The page analyzes public repositories with no credential, and reaches `runAnalysis`
    // directly rather than through the endpoint, so one can open without the other.
    expect(isOpenPath("/ci-coverage")).toBe(true);
    expect(isOpenPath("/api/analyze")).toBe(false);
  });

  it("matches on whole segments", () => {
    // `startsWith` on its own would open all three of these off the back of `/login`.
    expect(isOpenPath("/loginhelp")).toBe(false);
    expect(isOpenPath("/login-as")).toBe(false);
    expect(isOpenPath("/api/authorise")).toBe(false);
  });

  it("does not open a path by the look of it", () => {
    // A gate that reads the query string or an extension can be talked out of the decision.
    expect(isOpenPath("/tools/../login")).toBe(false);
    expect(isOpenPath("/tools.png")).toBe(false);
  });

  it("gates every route folder except the ones named here", () => {
    // Walked rather than listed, so a page added next month is covered without an edit. These
    // are the `OPEN` entries that are route folders; everything else has to be shut, and adding
    // a name here is the deliberate act that opening a page should take.
    const open = new Set([
      "login",
      "no-access",
      "api",
      "setup",
      "ci-coverage",
      "korza", // CLI assets and manifest must work without a browser session.
    ]);
    const routes = readdirSync("src/app", { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !open.has(entry.name))
      .map((entry) => `/${entry.name}`);

    expect(routes.length).toBeGreaterThan(4);
    for (const route of routes) {
      expect(isOpenPath(route), `${route} is not behind the gate`).toBe(false);
    }
  });
});
