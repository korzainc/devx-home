import toolsData from "@/data/tools.placeholder.json";
import skillsData from "@/data/skills.placeholder.json";

// The tool and skill shapes below are provisional stand-ins. The real tool schema arrives with
// catalogue.json (built by the catalogue repo) and the real skill schema is authored here; both
// will replace these outright. Field access is deliberately confined to this module and the two
// card renderers so that replacement stays a small diff rather than a sweep through the UI.

export type CatalogueEntry = {
  id: string;
  name: string;
  summary: string;
};

export type ToolEntry = CatalogueEntry & {
  category: string;
  capabilities: string[];
  stacks: string[];
  docsUrl: string;
};

export type SkillEntry = CatalogueEntry & {
  category: string;
  agents: string[];
  marketplaceUrl: string;
};

/** Keys whose values a facet can group by: a single string, or a list of them. */
export type FacetKey<T> = {
  [K in keyof T]: T[K] extends string | string[] ? K : never;
}[keyof T] &
  string;

export type Facet<T> = {
  key: FacetKey<T>;
  label: string;
};

export function facetValues<T>(entry: T, key: FacetKey<T>): string[] {
  const value = entry[key] as string | string[];
  return Array.isArray(value) ? value : [value];
}

export const tools: ToolEntry[] = toolsData;

export const skills: SkillEntry[] = skillsData;
