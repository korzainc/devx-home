/**
 * @vitest-environment node
 */
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NavLink } from "@/components/nav-link";
import { ProductsMenu } from "@/components/products-menu";

const pathname = vi.hoisted(() => ({ current: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

// The dropdown's dismiss behaviour is an effect on a real DOM; this suite renders to a string
// and only cares what the markup claims about the current page.
vi.mock("@/lib/use-dismissable-menu", () => ({
  useDismissableMenu: () => ({ current: null }),
}));

beforeEach(() => {
  pathname.current = "/";
});

const at = (route: string, node: React.ReactNode) => {
  pathname.current = route;
  return renderToString(<>{node}</>);
};

describe("a header link", () => {
  it("announces itself as the current page when it is", () => {
    expect(
      at(
        "/getting-started",
        <NavLink href="/getting-started" shape="row">
          Getting started
        </NavLink>,
      ),
    ).toContain('aria-current="page"');
  });

  it("makes no such claim when it is not", () => {
    expect(
      at(
        "/skills",
        <NavLink href="/getting-started" shape="row">
          Getting started
        </NavLink>,
      ),
    ).not.toContain("aria-current");
  });

  it("marks the current page by more than colour", () => {
    // The point of the assertion: contrast alone would leave the current page invisible to a
    // reader who cannot separate the two inks, so a weight step has to ride along with it.
    const markup = at(
      "/skills",
      <NavLink href="/skills" shape="row">
        Agent Skills
      </NavLink>,
    );

    expect(markup).toContain("text-ink");
    expect(markup).toContain("font-medium");
  });

  it("marks a current panel row by plate and weight, not colour alone", () => {
    const markup = at(
      "/skills",
      <NavLink href="/skills" shape="panel">
        Agent Skills
      </NavLink>,
    );

    expect(markup).toContain("bg-surface");
    expect(markup).toContain("font-medium");
  });

  it("rules the current row on the header's own border", () => {
    // `-bottom-px` is the whole point: the rule sits ON the 1px border, not floating above it.
    const markup = at(
      "/skills",
      <NavLink href="/skills" shape="row">
        Agent Skills
      </NavLink>,
    );

    expect(markup).toContain("-bottom-px");
    expect(markup).toContain("bg-accent");
  });

  it("keeps the rule out of the panel, which has no border to sit on", () => {
    expect(
      at(
        "/skills",
        <NavLink href="/skills" shape="panel">
          Agent Skills
        </NavLink>,
      ),
    ).not.toContain("bg-accent");
  });

  it("leaves the rule off rows that are not current", () => {
    expect(
      at(
        "/tools",
        <NavLink href="/skills" shape="row">
          Agent Skills
        </NavLink>,
      ),
    ).not.toContain("bg-accent");
  });

  it("still marks a product from one of its detail routes", () => {
    expect(
      at(
        "/skills/superpowers",
        <NavLink href="/skills" shape="panel">
          Agent Skills
        </NavLink>,
      ),
    ).toContain('aria-current="page"');
  });
});

describe("the products dropdown", () => {
  it("marks exactly the product you are on", () => {
    const markup = at("/tools", <ProductsMenu />);
    // Only the panel: the trigger now names the product too, so searching the whole header for
    // "CI Tools" finds the summary's copy first.
    const panel = markup.slice(markup.indexOf("</summary>"));
    const marked = [
      ...panel.matchAll(/<a[^>]*aria-current="page"[^>]*>(.*?)<\/a>/g),
    ];

    expect(marked).toHaveLength(1);
    expect(marked[0][1]).toContain("CI Tools");
  });

  const summary = (markup: string) =>
    markup.slice(markup.indexOf("<summary"), markup.indexOf("</summary>"));

  it("names the product you are on while it is shut", () => {
    // The failure this is here for: on /skills the closed trigger read "Products" exactly as it
    // does on /getting-started, so the bar gave no way to tell the two pages apart.
    const shut = summary(at("/skills", <ProductsMenu />));

    expect(shut).toContain("Products");
    expect(shut).toContain("Agent Skills");
  });

  it("rules the trigger on the border while the group holds the page", () => {
    expect(summary(at("/skills", <ProductsMenu />))).toContain("-bottom-px");
    expect(summary(at("/getting-started", <ProductsMenu />))).not.toContain(
      "-bottom-px",
    );
  });

  it("names it from a detail route too", () => {
    expect(summary(at("/tools/biome", <ProductsMenu />))).toContain("CI Tools");
  });

  it("is just the group name away from the products", () => {
    const shut = summary(at("/getting-started", <ProductsMenu />));

    expect(shut).toContain("Products");
    expect(shut).not.toContain("Agent Skills");
    expect(shut).not.toContain("font-medium");
  });
});
