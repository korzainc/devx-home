import { describe, expect, it } from "vitest";
import { inProducts, isCurrent, PRODUCTS } from "@/lib/nav";

describe("isCurrent", () => {
  it("matches the page itself", () => {
    expect(isCurrent("/skills", "/skills")).toBe(true);
  });

  it("matches a detail route under the page", () => {
    // The reason this is a prefix match at all: /skills/[plugin] should still mark Agent Skills.
    expect(isCurrent("/skills", "/skills/superpowers")).toBe(true);
    expect(isCurrent("/tools", "/tools/lint")).toBe(true);
  });

  it("stops at a segment boundary", () => {
    // The whole reason this is not `pathname.startsWith(href)`: /skills-intro is its own page,
    // and a bare prefix test would light up Agent Skills all over it.
    expect(isCurrent("/skills", "/skills-intro")).toBe(false);
    expect(isCurrent("/skills", "/skills-intro/demo")).toBe(false);
  });

  it("does not match an unrelated page", () => {
    expect(isCurrent("/skills", "/ci-coverage")).toBe(false);
  });

  it("matches the home page only exactly", () => {
    // `/` is a prefix of every route, so the segment-boundary rule cannot carry this one.
    expect(isCurrent("/", "/")).toBe(true);
    expect(isCurrent("/", "/skills")).toBe(false);
  });
});

describe("inProducts", () => {
  it("holds each product, including its detail routes", () => {
    for (const product of PRODUCTS) {
      expect(inProducts(product.href)).toBe(true);
      expect(inProducts(`${product.href}/anything`)).toBe(true);
    }
  });

  it("does not hold pages outside the group", () => {
    expect(inProducts("/getting-started")).toBe(false);
    expect(inProducts("/skills-intro")).toBe(false);
    expect(inProducts("/")).toBe(false);
  });
});

describe("no route to compare against", () => {
  // usePathname returns null where there is no router -- rendered outside an App Router
  // request. Nothing is current, rather than throwing on the null.
  it("marks nothing current", () => {
    expect(isCurrent("/skills", null)).toBe(false);
    expect(isCurrent("/", null)).toBe(false);
    expect(inProducts(null)).toBe(false);
  });
});
