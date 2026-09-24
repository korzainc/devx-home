import { describe, expect, it } from "vitest";
import { isRelevantToStack } from "./relevance";

describe("isRelevantToStack", () => {
  it("is relevant when one of the tool's capabilities is in the stack's list", () => {
    expect(
      isRelevantToStack({ capabilities: ["secrets"] }, [
        "secrets",
        "unit-tests",
      ]),
    ).toBe(true);
  });

  it("is not relevant when none of the tool's capabilities are in the list", () => {
    expect(
      isRelevantToStack({ capabilities: ["dependency-updates"] }, [
        "secrets",
        "unit-tests",
      ]),
    ).toBe(false);
  });

  it("is relevant if any one of several capabilities matches", () => {
    expect(
      isRelevantToStack(
        { capabilities: ["dependency-updates", "unit-tests"] },
        ["secrets", "unit-tests"],
      ),
    ).toBe(true);
  });

  it("is not relevant to an empty list", () => {
    expect(isRelevantToStack({ capabilities: ["secrets"] }, [])).toBe(false);
  });
});
