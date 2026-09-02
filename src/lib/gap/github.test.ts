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
    // The SSH form has its own host check. Without this line, widening it to any host passed.
    expect(parseRepoRef("git@gitlab.com:korzainc/devx-home.git")).toBeNull();
  });

  it("rejects dot segments that would redirect the API request", () => {
    // `/repos/../user` normalises to `/user`, so these would read the caller's own account and
    // the org list instead of a repository.
    expect(parseRepoRef("../user")).toBeNull();
    expect(parseRepoRef("../organizations")).toBeNull();
    expect(parseRepoRef("korzainc/..")).toBeNull();
    expect(parseRepoRef("./user")).toBeNull();

    // A leading dot is still a real repository name.
    expect(parseRepoRef("korzainc/.github")).toEqual({
      provider: "github",
      owner: "korzainc",
      repo: ".github",
    });
  });
});
