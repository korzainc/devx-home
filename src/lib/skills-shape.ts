// `category` and `audience` now come from a skill author's frontmatter, and the overlays that
// were constraining them are going. Each of these three decides where a row renders, or whether
// it renders at all, and each fails silently at render.

import { AUDIENCES } from "@/data/skill-audiences";
import { CATEGORIES } from "@/data/skill-categories";
import { KINDS } from "@/lib/catalogue-entries";

function isFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function problemsWithSkill(skill: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const id = isFilled(skill.id) ? (skill.id as string) : "a skill";

  // An unrecognised value renders under a heading nothing defines.
  if (!("category" in skill)) {
    problems.push(`${id}: category is missing`);
  } else if (!isFilled(skill.category)) {
    problems.push(`${id}: category must be a non-empty string`);
  } else if (
    !(CATEGORIES as readonly string[]).includes(skill.category as string)
  ) {
    problems.push(
      `${id}: category ${JSON.stringify(skill.category)} is not one of ${JSON.stringify(CATEGORIES)}`,
    );
  }

  // The catalogue branches on `kind !== "skill"`, so anything unrecognised reads as toolchain.
  if (!("kind" in skill)) {
    problems.push(`${id}: kind is missing`);
  } else if (!isFilled(skill.kind)) {
    problems.push(`${id}: kind must be a non-empty string`);
  } else if (!(KINDS as readonly string[]).includes(skill.kind as string)) {
    problems.push(
      `${id}: kind ${JSON.stringify(skill.kind)} is not one of ${JSON.stringify(KINDS)}`,
    );
  }

  // `matchesAudience` filters on these names, so a typo hides the row from every filter.
  if (!Array.isArray(skill.audience) || skill.audience.length === 0) {
    problems.push(`${id}: audience must be a non-empty list`);
  } else {
    const unknown = skill.audience.filter(
      (audience) =>
        !(AUDIENCES as readonly string[]).includes(audience as string),
    );
    if (unknown.length > 0) {
      problems.push(
        `${id}: audience ${JSON.stringify(unknown)} matches no filter; expected ${JSON.stringify(AUDIENCES)}`,
      );
    }
  }

  return problems;
}
