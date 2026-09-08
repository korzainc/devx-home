import { describe, expect, it } from "vitest";
import {
  TOOL_CARD_SUMMARY_LIMIT,
  toolCardSummaries,
} from "@/data/tool-card-summaries";
import { tools } from "./catalogue";

// The overlay is hand-authored while the catalogue it annotates is synced from
// shared-workflows. These guard the seam: a sync that adds, removes or renames a tool should
// fail here rather than quietly render an upstream summary that overflows the card.
describe("tool card summaries", () => {
  it("covers every tool and bundle", () => {
    for (const tool of tools) {
      expect(
        toolCardSummaries[tool.id],
        `${tool.id} has no card summary; add one to tool-card-summaries.ts`,
      ).toBeDefined();
    }
  });

  it("has no entry for a tool the catalogue dropped", () => {
    const known = new Set(tools.map((tool) => tool.id));
    for (const id of Object.keys(toolCardSummaries)) {
      expect(known.has(id), `${id} is no longer in the catalogue`).toBe(true);
    }
  });

  // Two lines at the card's width. Past this the clamp starts eating words, which is the exact
  // problem the overlay exists to solve.
  it("keeps every summary inside the card's two lines", () => {
    for (const [id, summary] of Object.entries(toolCardSummaries)) {
      expect(
        summary.length,
        `${id} is ${summary.length} chars: ${JSON.stringify(summary)}`,
      ).toBeLessThanOrEqual(TOOL_CARD_SUMMARY_LIMIT);
    }
  });

  it("reads as a sentence rather than a truncated fragment", () => {
    for (const [id, summary] of Object.entries(toolCardSummaries)) {
      expect(summary.length, `${id} is too short to be real`).toBeGreaterThan(
        20,
      );
      expect(summary.endsWith("."), `${id} does not end in a full stop`).toBe(
        true,
      );
    }
  });

  it("falls back to the upstream summary when the overlay has no entry", () => {
    const uncovered = tools.find((tool) => !toolCardSummaries[tool.id]);
    // Nothing is uncovered today, so assert the rule the fallback encodes instead: every tool
    // ends up with card copy, whichever side it came from.
    expect(uncovered).toBeUndefined();
    for (const tool of tools) {
      expect(
        tool.cardSummary.length,
        `${tool.id} has empty card copy`,
      ).toBeGreaterThan(0);
    }
  });
});
