/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ToolPage, {
  generateMetadata,
  generateStaticParams,
} from "@/app/tools/[id]/page";
import { bundles, tools } from "@/lib/catalogue";

function renderTool(id: string) {
  return ToolPage({
    params: Promise.resolve({ id }),
  } as Parameters<typeof ToolPage>[0]);
}

describe("ToolPage", () => {
  // vitest.config.mts sets globals: false, so RTL's own afterEach-based auto-cleanup never
  // registers - every component test file in this repo does this explicitly for that reason.
  afterEach(cleanup);

  it("prerenders every tool and bundle, with no duplicate ids", () => {
    const params = generateStaticParams();
    const ids = params.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(tools.map((tool) => tool.id).sort());
  });

  it("calls notFound for an id the catalogue does not have", async () => {
    await expect(renderTool("not-a-real-tool")).rejects.toThrow();
  });

  it("returns no metadata for an unknown id rather than throwing", async () => {
    await expect(
      generateMetadata({
        params: Promise.resolve({ id: "not-a-real-tool" }),
      } as Parameters<typeof generateMetadata>[0]),
    ).resolves.toEqual({});
  });

  it("links a wrapped tool back to the bundle that covers it", async () => {
    const wrapped = bundles[0].wraps[0].tool;
    render(await renderTool(wrapped));

    const link = screen.getByRole("link", {
      name: (accessibleName) => accessibleName.startsWith(bundles[0].name),
    });
    expect(link.getAttribute("href")).toBe(`/tools/${bundles[0].id}`);
  });

  it("resolves every wrapped tool in a bundle to a real, linked entry", async () => {
    for (const bundle of bundles) {
      render(await renderTool(bundle.id));

      const heading = screen.getByRole("heading", {
        name: `Tools in this bundle (${bundle.wraps.length})`,
      });
      const grid = heading.closest("section") ?? heading.parentElement!;

      for (const wrap of bundle.wraps) {
        const wrappedTool = tools.find((tool) => tool.id === wrap.tool);
        expect(
          wrappedTool,
          `bundle "${bundle.id}" wraps unknown tool id "${wrap.tool}"`,
        ).toBeDefined();
        expect(
          grid.querySelector(`a[href="/tools/${wrap.tool}"]`),
          `wrapped tool "${wrap.tool}" rendered as a bare id, not a link`,
        ).not.toBeNull();
      }

      // Each iteration renders a fresh page; without this, the next bundle's query would also
      // match whatever this one just rendered.
      cleanup();
    }
  });
});
