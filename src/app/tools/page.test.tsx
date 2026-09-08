import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import ToolsPage from "@/app/tools/page";

// `ToolsPage` stays a plain (non-async) function so the static shell above it prerenders; the
// actual `searchParams` parsing happens in a nested async `Catalogue` component, deferred behind
// `Suspense` (mirroring `gap-analysis/page.tsx`). React 19 client rendering can't mount an async
// component directly ("Only Server Components can be async at the moment"), so this drives the
// element tree the same way React itself does: call the component functions directly and inspect
// what they return, without going through ReactDOM.
function findByName(
  element: ReactElement,
  name: string,
): ReactElement | undefined {
  if (typeof element.type === "function" && element.type.name === name) {
    return element;
  }
  const props = element.props as { children?: unknown; fallback?: unknown };
  const candidates = [
    ...(Array.isArray(props.children) ? props.children : [props.children]),
    props.fallback,
  ];
  for (const child of candidates) {
    if (child && typeof child === "object" && "type" in child) {
      const found = findByName(child as ReactElement, name);
      if (found) return found;
    }
  }
  return undefined;
}

describe("the tools page", () => {
  it("parses ?stack=/?check= into comma-separated initial props for the catalogue", async () => {
    const page = ToolsPage({
      searchParams: Promise.resolve({ stack: "go,docker", check: "linting" }),
    }) as ReactElement;

    const catalogueElement = findByName(page, "Catalogue")!;
    expect(catalogueElement).toBeTruthy();

    const asyncCatalogue = catalogueElement.type as (
      props: unknown,
    ) => Promise<ReactElement>;
    const rendered = await asyncCatalogue(catalogueElement.props);

    expect(rendered.props).toMatchObject({
      initialStacks: ["go", "docker"],
      initialChecks: ["linting"],
    });
  });

  it("defaults to empty selections when a param is absent", async () => {
    const page = ToolsPage({
      searchParams: Promise.resolve({}),
    }) as ReactElement;

    const catalogueElement = findByName(page, "Catalogue")!;
    const asyncCatalogue = catalogueElement.type as (
      props: unknown,
    ) => Promise<ReactElement>;
    const rendered = await asyncCatalogue(catalogueElement.props);

    expect(rendered.props).toMatchObject({
      initialStacks: [],
      initialChecks: [],
    });
  });

  it("treats a present but empty param as no selection, not a phantom entry", async () => {
    // "".split(",") is ["with an empty phantom entry"], not [] - a bare `?stack=` must not be
    // read as "one picked stack that matches nothing".
    const page = ToolsPage({
      searchParams: Promise.resolve({ stack: "", check: "" }),
    }) as ReactElement;

    const catalogueElement = findByName(page, "Catalogue")!;
    const asyncCatalogue = catalogueElement.type as (
      props: unknown,
    ) => Promise<ReactElement>;
    const rendered = await asyncCatalogue(catalogueElement.props);

    expect(rendered.props).toMatchObject({
      initialStacks: [],
      initialChecks: [],
    });
  });

  it("drops empty segments from a trailing or doubled comma", async () => {
    const page = ToolsPage({
      searchParams: Promise.resolve({
        stack: "go,",
        check: "linting,,testing",
      }),
    }) as ReactElement;

    const catalogueElement = findByName(page, "Catalogue")!;
    const asyncCatalogue = catalogueElement.type as (
      props: unknown,
    ) => Promise<ReactElement>;
    const rendered = await asyncCatalogue(catalogueElement.props);

    expect(rendered.props).toMatchObject({
      initialStacks: ["go"],
      initialChecks: ["linting", "testing"],
    });
  });

  it("trims whitespace around a comma-separated param", async () => {
    const page = ToolsPage({
      searchParams: Promise.resolve({ stack: "go, docker " }),
    }) as ReactElement;

    const catalogueElement = findByName(page, "Catalogue")!;
    const asyncCatalogue = catalogueElement.type as (
      props: unknown,
    ) => Promise<ReactElement>;
    const rendered = await asyncCatalogue(catalogueElement.props);

    expect(rendered.props).toMatchObject({
      initialStacks: ["go", "docker"],
    });
  });

  it("renders the fallback catalogue with no initial selection, for the prerendered shell", () => {
    const page = ToolsPage({
      searchParams: Promise.resolve({}),
    }) as ReactElement;

    const toolsCatalogueFallback = findByName(page, "ToolsCatalogue")!;
    expect(toolsCatalogueFallback).toBeTruthy();
    expect(
      (toolsCatalogueFallback.props as Record<string, unknown>).initialStacks,
    ).toBeUndefined();
  });
});
