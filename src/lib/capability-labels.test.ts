import { describe, expect, it } from "vitest";
import catalogueData from "@/data/catalogue.json";
import { capabilityLabelOverrides } from "@/data/capability-labels";
import { capabilityLabel, capabilityLabels, tools } from "./catalogue";

const upstream = catalogueData.taxonomy.capabilities as Record<
  string,
  { label: string }
>;

// The overrides are hand-authored against a taxonomy synced from shared-workflows. These guard
// the seam: a sync that renames an id, drops one, or adopts our wording should fail here rather
// than leave a dead override nobody notices.
describe("capability labels", () => {
  it("only overrides ids the taxonomy still has", () => {
    for (const id of Object.keys(capabilityLabelOverrides)) {
      expect(
        upstream[id],
        `${id} is no longer in the taxonomy; drop it from capability-labels.ts`,
      ).toBeDefined();
    }
  });

  it("carries no override that merely restates upstream", () => {
    for (const [id, label] of Object.entries(capabilityLabelOverrides)) {
      expect(
        label,
        `${id} now matches upstream; drop it from capability-labels.ts`,
      ).not.toBe(upstream[id]?.label);
    }
  });

  it("names every capability a tool claims", () => {
    for (const tool of tools) {
      for (const capability of tool.capabilities) {
        expect(
          capabilityLabels[capability],
          `${tool.id} claims "${capability}", which the taxonomy does not define`,
        ).toBeTruthy();
      }
    }
  });

  // The exported map is what client components read; `capabilityLabel` is what the server pages
  // and the gap report read. A capability named two different ways across those is the exact
  // failure the shared function exists to prevent.
  it("agrees with the function the server pages call", () => {
    for (const id of Object.keys(upstream)) {
      expect(capabilityLabels[id]).toBe(
        capabilityLabel(id as Parameters<typeof capabilityLabel>[0]),
      );
    }
  });

  it("refuses an id the taxonomy does not define", () => {
    expect(() =>
      capabilityLabel(
        "not-a-capability" as Parameters<typeof capabilityLabel>[0],
      ),
    ).toThrow(/not-a-capability/);
  });
});
