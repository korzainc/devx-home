import { describe, expect, it } from "vitest";
import { parseRepoRef } from "./github";

describe("parseRepoRef", () => {
  it("accepts the forms someone actually pastes", () => {
    const expected = {
      provider: "github",
      owner: "korzainc",
      repo: "devx-home",
    };

    expect(parseRepoRef("korzainc/devx-home")).toEqual(expected);
    expect(parseRepoRef("https://github.com/korzainc/devx-home")).toEqual(
      expected,
    );
    expect(parseRepoRef("http://www.github.com/korzainc/devx-home")).toEqual(
      expected,
    );
    expect(parseRepoRef("https://github.com/korzainc/devx-home/")).toEqual(
      expected,
    );
    expect(parseRepoRef("https://github.com/korzainc/devx-home.git")).toEqual(
      expected,
    );
    expect(parseRepoRef("git@github.com:korzainc/devx-home.git")).toEqual(
      expected,
    );
    expect(parseRepoRef("  korzainc/devx-home  ")).toEqual(expected);
  });

  it("rejects anything that is not a repository", () => {
    expect(parseRepoRef("")).toBeNull();
    expect(parseRepoRef("   ")).toBeNull();
    expect(parseRepoRef("korzainc")).toBeNull();
    expect(parseRepoRef("not a repo")).toBeNull();
    // A path deeper than the repo root is not a repo, even though it starts like one.
    expect(
      parseRepoRef("https://github.com/korzainc/devx-home/tree/main"),
    ).toBeNull();
    expect(parseRepoRef("https://gitlab.com/korzainc/devx-home")).toBeNull();
  });
});
