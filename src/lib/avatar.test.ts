import { describe, expect, it } from "vitest";
import { avatarSrc, initials } from "./avatar";

describe("initials", () => {
  it("takes the first and last word, so a middle name does not win", () => {
    expect(initials("Srijan Saurav")).toBe("SS");
    expect(initials("Ada King Lovelace")).toBe("AL");
  });

  // Real rows in the user table: GitHub display names are often a bare handle.
  it("takes two letters from a single word", () => {
    expect(initials("VinayPolisetti")).toBe("VI");
    expect(initials("james-korza-ai")).toBe("JA");
  });

  it("does not render blank for a name that is only whitespace", () => {
    // `name` is not null in the schema, but "" would draw an empty circle rather than fall back.
    expect(initials("   ")).toBe("?");
    expect(initials("")).toBe("?");
  });

  it("survives a one-letter name", () => {
    expect(initials("X")).toBe("X");
  });
});

describe("avatarSrc", () => {
  it("asks GitHub for the size the header draws, not the 460px default", () => {
    expect(avatarSrc("https://avatars.githubusercontent.com/u/21181916?v=4")).toBe(
      "https://avatars.githubusercontent.com/u/21181916?v=4&s=64",
    );
  });

  it("replaces a size that is already there rather than adding a second one", () => {
    expect(avatarSrc("https://avatars.githubusercontent.com/u/1?s=460")).toBe(
      "https://avatars.githubusercontent.com/u/1?s=64",
    );
  });

  // This runs in the root layout's header, so a throw here is every page, not one avatar.
  it("hands back anything it cannot parse instead of throwing", () => {
    expect(avatarSrc("not-a-url")).toBe("not-a-url");
    expect(avatarSrc("")).toBe("");
  });
});
