import { describe, expect, it } from "vitest";
import skillsData from "@/data/skills.json";
import { problemsWithSkill } from "./skills-shape";

const valid = {
  id: "codezen:skills/brainstorm",
  category: "Decide",
  kind: "skill",
  audience: ["Engineering"],
};

describe("a skill row", () => {
  it("is accepted when every checked field is well shaped", () => {
    expect(problemsWithSkill(valid)).toEqual([]);
  });

  it.each(["category", "kind", "audience"])(
    "is rejected without %s",
    (field) => {
      const { [field]: _dropped, ...rest } = valid as Record<string, unknown>;
      expect(problemsWithSkill(rest).join(" ")).toContain(field);
    },
  );

  // "Build" is the shape of the mistake: a real category name, retired upstream.
  it.each(["Build", "", "make", "Decide "])(
    "is rejected when category is %j",
    (category) => {
      expect(problemsWithSkill({ ...valid, category }).join(" ")).toContain(
        "category",
      );
    },
  );

  it.each(["plugin", "", "Skill"])("is rejected when kind is %j", (kind) => {
    expect(problemsWithSkill({ ...valid, kind }).join(" ")).toContain("kind");
  });

  it.each([[[]], ["Engineering"], [["Marketing"]], [["Engineering", "Legal"]]])(
    "is rejected when audience is %j",
    (audience) => {
      expect(problemsWithSkill({ ...valid, audience }).join(" ")).toContain(
        "audience",
      );
    },
  );

  // "is missing" about a field the author can see sends them looking for the wrong thing.
  it.each([
    ["category", 123],
    ["kind", null],
  ])(
    "tells %s apart from missing when it is present but not a string",
    (field, value) => {
      const problems = problemsWithSkill({ ...valid, [field]: value }).join(
        " ",
      );
      expect(problems).toContain(`${field} must be a non-empty string`);
      expect(problems).not.toContain("is missing");
    },
  );

  // Not just the first, or an author learns about the next only on the next run.
  it("reports every problem at once", () => {
    const problems = problemsWithSkill({
      id: "x",
      category: "Build",
      kind: "plugin",
      audience: ["Marketing"],
    });
    expect(problems).toHaveLength(3);
  });

  // Without an id the message still has to say which row.
  it("names an unidentified row rather than saying nothing", () => {
    expect(problemsWithSkill({}).join(" ")).toContain("a skill");
  });
});

describe("the published index", () => {
  const skills = skillsData.skills as Record<string, unknown>[];

  it("has a well shaped row for every skill", () => {
    for (const skill of skills) {
      expect(problemsWithSkill(skill), `${skill.id}`).toEqual([]);
    }
  });

  // Filtered off the site, but published the moment someone changes a status upstream.
  it("covers the planned rows too", () => {
    const planned = skills.filter((skill) => skill.status === "Planned");
    expect(planned.length).toBeGreaterThan(0);
    for (const skill of planned) {
      expect(problemsWithSkill(skill), `${skill.id}`).toEqual([]);
    }
  });
});
