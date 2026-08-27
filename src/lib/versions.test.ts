import { describe, expect, it } from "vitest";
import {
  describeVersion,
  plugins,
  versionFacetLabel,
  versionStatusFor,
  type VersionStatus,
} from "./catalogue";

// The README said mattpocock-skills tracks main "until upstream tags 1.2.0". It reached
// v1.2.3 and nobody noticed.
describe("version drift", () => {
  it("reports a status for every plugin in the catalogue", () => {
    for (const plugin of plugins) {
      expect(
        versionStatusFor(plugin.id),
        `${plugin.id} has no version status`,
      ).toBeDefined();
    }
  });

  it("only counts versions behind when the entry is pinned to a tag", () => {
    for (const plugin of plugins) {
      const status = versionStatusFor(plugin.id)!;
      if (status.state === "behind") {
        expect(
          status.behind,
          `${plugin.id} is behind by no versions`,
        ).toBeGreaterThan(0);
        expect(status.latest, `${plugin.id} is behind nothing`).toBeTruthy();
      } else {
        // No fixed point to be behind of.
        expect(
          status.behind,
          `${plugin.id} is ${status.state} but carries a behind count`,
        ).toBeNull();
      }
    }
  });

  it("distinguishes an entry we have not pinned from one we cannot pin", () => {
    expect(versionStatusFor("mattpocock-skills")?.state).toBe("unpinned");
    expect(versionStatusFor("codezen")?.state).toBe("no-releases");
  });

  it("describes every state in one readable line", () => {
    for (const plugin of plugins) {
      const line = describeVersion(versionStatusFor(plugin.id)!);
      expect(line, `${plugin.id} has an empty description`).toBeTruthy();
      expect(line).not.toContain("null");
      expect(line).not.toContain("undefined");
    }
  });
});

// The loop above never compares a sentence, and the catalogue carries only three of the four
// states.
describe("version wording", () => {
  const status = (over: Partial<VersionStatus>): VersionStatus => ({
    state: "current",
    pinned: "v1.0.0",
    latest: "v1.0.0",
    behind: null,
    ...over,
  });

  it("states each of the four cases exactly", () => {
    expect(describeVersion(status({ state: "current" }))).toBe("current");
    expect(
      describeVersion(
        status({ state: "behind", behind: 2, latest: "v2.11.1" }),
      ),
    ).toBe("2 versions behind (v2.11.1)");
    expect(
      describeVersion(
        status({ state: "unpinned", pinned: "main", latest: "v1.2.3" }),
      ),
    ).toBe("unpinned, upstream is at v1.2.3");
    expect(
      describeVersion(
        status({ state: "no-releases", pinned: "main", latest: null }),
      ),
    ).toBe("unpinned, upstream has no releases");
  });

  it("says version, not versions, at one", () => {
    expect(
      describeVersion(status({ state: "behind", behind: 1, latest: "v6.3.0" })),
    ).toBe("1 version behind (v6.3.0)");
  });

  // Falling through returned undefined, which React renders as an empty badge.
  it("names an unrecognised state instead of rendering nothing", () => {
    const line = describeVersion(
      status({ state: "sideways" as VersionStatus["state"] }),
    );
    expect(line).toBe("pin state unknown (sideways)");
  });

  it("labels the facet for every state, and for a missing one", () => {
    expect(versionFacetLabel(status({ state: "behind" }))).toBe("Behind");
    expect(versionFacetLabel(status({ state: "current" }))).toBe("Current");
    expect(versionFacetLabel(status({ state: "unpinned" }))).toBe("Unpinned");
    expect(versionFacetLabel(status({ state: "no-releases" }))).toBe(
      "No releases",
    );
    expect(versionFacetLabel(undefined)).toBe("Unknown");
  });
});
