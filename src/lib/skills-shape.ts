// skills.json is generated, so nothing here has ever needed to check it: the values it carried
// were written by a maintainer editing an overlay in the marketplace repository, and the two
// fields that drive rendering were replaced by local overlays on the way in anyway.
//
// Both halves of that stopped being true. `category` and `audience` now come from a skill
// author's own SKILL.md frontmatter, and the overlays that were quietly constraining them are
// going. These are the three fields where a bad value does more than look wrong: each one
// decides where a row renders, or whether it renders at all.

import { AUDIENCES } from "@/data/skill-audiences";
import { CATEGORIES } from "@/data/skill-categories";
import { KINDS } from "@/lib/catalogue-entries";

function isFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function problemsWithSkill(skill: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const id = isFilled(skill.id) ? (skill.id as string) : "a skill";

  // A row renders under its category heading. An unrecognised one renders under a heading
  // nothing defines, so the row is on the page but under nothing a reader can filter to.
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

  // The catalogue branches on `kind !== "skill"`, so an unrecognised value is silently treated
  // as toolchain: marked on the card and sorted last, under a heading it does belong to.
  if (!("kind" in skill)) {
    problems.push(`${id}: kind is missing`);
  } else if (!isFilled(skill.kind)) {
    problems.push(`${id}: kind must be a non-empty string`);
  } else if (!(KINDS as readonly string[]).includes(skill.kind as string)) {
    problems.push(
      `${id}: kind ${JSON.stringify(skill.kind)} is not one of ${JSON.stringify(KINDS)}`,
    );
  }

  // Membership, not just non-empty: `matchesAudience` filters on these names, so a typo makes
  // the row invisible to every audience a reader can pick, with nothing failing at render.
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
