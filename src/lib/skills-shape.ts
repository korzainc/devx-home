// `category`, `audience` and `status` now come from a skill author's frontmatter, and the
// overlays that were constraining them are going. Each field here fails silently at render.

import { AUDIENCES, AUDIENCE_ANY } from "@/data/skill-audiences";
import { CATEGORIES } from "@/data/skill-categories";
import { KINDS, STATUSES } from "@/lib/catalogue-entries";
import { isFilled, isOneOf } from "@/lib/shape";

/** Absent and present-but-unusable are different problems: saying "is missing" about a field the
 *  author can see in their file sends them looking for the wrong thing. */
function problemWithText(
  id: string,
  skill: Record<string, unknown>,
  field: string,
): string | null {
  if (!(field in skill)) return `${id}: ${field} is missing`;
  if (!isFilled(skill[field]))
    return `${id}: ${field} must be a non-empty string`;
  return null;
}

function problemWithEnum(
  id: string,
  skill: Record<string, unknown>,
  field: string,
  permitted: readonly string[],
): string | null {
  const problem = problemWithText(id, skill, field);
  if (problem) return problem;
  if (isOneOf(permitted, skill[field])) return null;
  return `${id}: ${field} ${JSON.stringify(skill[field])} is not one of ${JSON.stringify(permitted)}`;
}

export function problemsWithSkill(skill: Record<string, unknown>): string[] {
  const problems: (string | null)[] = [];
  const id = isFilled(skill.id) ? skill.id : "a skill";

  // Every overlay and lookup keys on it, and it is the card's React key.
  problems.push(problemWithText(id, skill, "id"));

  // Sections are built from CATEGORIES alone, so an unrecognised value does not render under a
  // stray heading: the row drops off the page and out of the count.
  problems.push(problemWithEnum(id, skill, "category", CATEGORIES));

  // The catalogue branches on `kind !== "skill"`, so anything unrecognised reads as toolchain.
  problems.push(problemWithEnum(id, skill, "kind", KINDS));

  // `overlaySkills` hides a row only on an exact "Planned", so any other spelling renders live.
  problems.push(problemWithEnum(id, skill, "status", STATUSES));

  problems.push(...problemsWithAudience(id, skill.audience));

  return problems.filter((problem): problem is string => problem !== null);
}

function problemsWithAudience(id: string, audience: unknown): string[] {
  if (!Array.isArray(audience) || audience.length === 0) {
    return [`${id}: audience must be a non-empty list`];
  }

  const problems: string[] = [];

  // `matchesAudience` filters on these names, so a typo hides the row from every filter.
  const unknown = audience.filter((value) => !isOneOf(AUDIENCES, value));
  if (unknown.length > 0) {
    problems.push(
      `${id}: audience ${JSON.stringify(unknown)} matches no filter; expected ${JSON.stringify(AUDIENCES)}`,
    );
  }

  if (new Set(audience).size !== audience.length) {
    problems.push(
      `${id}: audience ${JSON.stringify(audience)} repeats a value`,
    );
  }

  // `matchesAudience` already unions the AUDIENCE_ANY rows into whichever audience is picked, so
  // a specific value beside it changes nothing. Upstream records this as a convention its schema
  // cannot express, and nothing else checks it once the overlay goes.
  if (audience.includes(AUDIENCE_ANY) && audience.length > 1) {
    problems.push(
      `${id}: audience ${JSON.stringify(audience)} pairs ${JSON.stringify(AUDIENCE_ANY)} with a specific audience, which changes nothing`,
    );
  }

  return problems;
}
