import { describe, expect, it } from "vitest";
import catalogueData from "@/data/catalogue.json";
import { CHECK_GROUPS } from "./tools-catalogue";

const upstream = Object.keys(catalogueData.taxonomy.capabilities);
const grouped = CHECK_GROUPS.flatMap((group) => group.capabilities);

// CHECK_GROUPS is hand-authored against a taxonomy synced from shared-workflows. A capability
// that belongs to no group is unreachable through the filter, and the page gives no sign of it.
describe("check groups", () => {
  it("claims every capability the taxonomy defines", () => {
    for (const id of upstream) {
      expect(
        grouped,
        `"${id}" is in no check group, so no filter reaches the tools that run it`,
      ).toContain(id);
    }
  });

  it("claims nothing the taxonomy dropped", () => {
    for (const id of grouped) {
      expect(
        upstream,
        `"${id}" is no longer in the taxonomy; drop it from CHECK_GROUPS`,
      ).toContain(id);
    }
  });

  // Groups may overlap as a matter of design, but a duplicate is far more often a slip, and it
  // double-counts the tool in the number beside the group.
  it("files each capability under one group", () => {
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("gives each group a distinct id, since the id is what the URL carries", () => {
    const ids = CHECK_GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
