// The shape of `src/data/catalogue.json`, as built by `catalogue/build_artifact.py` in
// korzainc/shared-workflows. Transcribed from the schema those PRs validate against, so a field
// that is optional here is optional there too.
//
// Nothing in this file is our own invention: if a field looks wrong, the catalogue is the source
// of truth and this file is the thing to correct.

/** Closed set, enforced by `validate.py`. A fourth runner fails validation upstream. */
export type Runner = "docker-run" | "reusable-workflow" | "github-action";

/** One `with:` input. The note is written for a human reading the generated YAML. */
export type InvocationArg = {
  value: string | number | boolean;
  note: string;
};

export type Invocation = {
  /** Present for `reusable-workflow` and `github-action`. */
  action?: string;
  /** Present for `docker-run`. */
  image?: string;
  runner?: Runner;
  args?: Record<string, InvocationArg>;
  /** `diff` means the check only looks at changed files. Surfaced, not acted on. */
  scope?: string;
};

/**
 * Vendor-keyed, then capability-keyed - except bundles, whose `github` value is a single
 * invocation covering every capability at once. `invocationFor` in adapt.ts is the only place
 * that difference is handled.
 */
export type InvocationBlock = {
  github?: Invocation | Record<string, Invocation>;
  azureDevops?: Record<string, unknown>;
};

export type Detection = {
  github?: { ciUses?: string[]; commands?: string[] };
  azureDevops?: Record<string, unknown>;
  /** Vendor-neutral: a config file or a dependency is the same fact on any CI vendor. */
  configFiles?: string[];
  manifestDeps?: string[];
};

export type Applicability = {
  /** `*` means every language, the artifact's spelling of the old `any`. */
  languages?: string[];
  buildSystems?: string[];
};

export type CatalogueTool = {
  id: string;
  name: string;
  summary: string;
  problem?: string;
  benefits?: string[];
  capabilities: string[];
  applicability?: Applicability;
  install?: unknown[];
  invocation?: InvocationBlock;
  detection?: Detection;
  overlaps?: string[];
  docsUrl?: string;
};

/** A bundle is a tool that wraps others behind one entry point. Same shape plus `wraps`. */
export type CatalogueBundle = CatalogueTool & {
  wraps?: { tool: string; capabilities: string[] }[];
};

export type Taxonomy = {
  categories: Record<string, { label: string }>;
  capabilities: Record<string, { category: string; label: string }>;
  languages?: string[];
  buildSystems?: string[];
};

/** `recommended` names one entry id; `acceptable` names equally valid alternatives. */
export type BaselineRule = {
  recommended: string;
  acceptable?: string[];
  /** False means advisory: worth having, but not a failure to be missing. */
  required: boolean;
};

export type CatalogueBaseline = {
  ecosystem: string;
  markers: string[];
  baseline: Record<string, BaselineRule>;
};

export type Catalogue = {
  taxonomy: Taxonomy;
  tools: Record<string, CatalogueTool>;
  bundles: Record<string, CatalogueBundle>;
  baselines: Record<string, CatalogueBaseline>;
};
