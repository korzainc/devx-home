import { describe, expect, it } from "vitest";
import { pinMessage } from "./pin-warning";
import { plugins } from "@/lib/catalogue";
import { VERSION_STATES, type VersionStatus } from "@/lib/catalogue-entries";

const status = (over: Partial<VersionStatus>): VersionStatus => ({
  state: "current",
  pinned: "v1.0.0",
  latest: "v1.0.0",
  behind: null,
  ...over,
});

describe("the pin warning", () => {
  it("says nothing when an entry is current", () => {
    expect(pinMessage(status({ state: "current" }))).toBeNull();
  });

  it("names the branch and the release it is ignoring when unpinned", () => {
    const message = pinMessage(
      status({ state: "unpinned", pinned: "main", latest: "v1.2.3" }),
    );
    expect(message).toContain("main");
    expect(message).toContain("v1.2.3");
    expect(message).toContain("without review");
  });

  // Distinct from unpinned: nobody chose this, and re-pinning is not the fix.
  it("says upstream has published nothing when there are no releases", () => {
    const message = pinMessage(
      status({ state: "no-releases", pinned: "main", latest: null }),
    );
    expect(message).toContain("no releases");
    expect(message).not.toContain("null");
  });

  it("counts the releases behind, and does not say '1 releases'", () => {
    expect(
      pinMessage(status({ state: "behind", behind: 3, latest: "v6.4.2" })),
    ).toContain("3 releases behind v6.4.2");
    expect(pinMessage(status({ state: "behind", behind: 1 }))).toContain(
      "1 release behind",
    );
  });

  // Every state has to render something or deliberately nothing; a new one upstream must not
  // fall through to `undefined` on the page.
  it.each(VERSION_STATES)("handles the %s state", (state) => {
    expect(pinMessage(status({ state, behind: 2, latest: "v2.0.0" }))).not.toBe(
      undefined,
    );
  });
});

describe("the committed catalogue", () => {
  it("gives every plugin a version block", () => {
    for (const plugin of plugins) {
      expect(plugin.version, `${plugin.id}`).toBeDefined();
      expect(VERSION_STATES).toContain(plugin.version.state);
    }
  });

  // The signal this restores: before DX-170 it was a hand-written sentence that went stale, and
  // deleting that sentence left nothing in its place.
  it("warns about every entry that is not current", () => {
    const warned = plugins
      .filter((plugin) => plugin.version.state !== "current")
      .map((plugin) => pinMessage(plugin.version));
    expect(warned.length).toBeGreaterThan(0);
    for (const message of warned) expect(message).toBeTruthy();
  });
});
