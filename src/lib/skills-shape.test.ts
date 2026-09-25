import { describe, expect, it } from "vitest";
import skillsData from "@/data/skills.json";
import { problemsWithSkill } from "./skills-shape";

const valid = {
  id: "codezen:skills/brainstorm",
  category: "Decide",
  kind: "skill",
  status: "Live",
  audience: ["Engineering"],
};

describe("a skill row", () => {
  it("is accepted when every checked field is well shaped", () => {
    expect(problemsWithSkill(valid)).toEqual([]);
  });

  it.each(["id", "category", "kind", "status", "audience"])(
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

  // `overlaySkills` hides a row on an exact "Planned", so anything else renders as a live card.
  it.each(["planned", "Draft", "", "live"])(
    "is rejected when status is %j",
    (status) => {
      expect(problemsWithSkill({ ...valid, status }).join(" ")).toContain(
        "status",
      );
    },
  );

  it.each([[[]], ["Engineering"], [["Marketing"]], [["Engineering", "Legal"]]])(
    "is rejected when audience is %j",
    (audience) => {
      expect(problemsWithSkill({ ...valid, audience }).join(" ")).toContain(
        "audience",
      );
    },
  );

  it("is rejected when audience repeats a value", () => {
    expect(
      problemsWithSkill({
        ...valid,
        audience: ["Engineering", "Engineering"],
      }).join(" "),
    ).toContain("repeats a value");
  });

  // "All" already unions into whichever audience is picked, so a specific value beside it can
  // never change what a reader sees. Nothing else checks this once the overlay goes.
  it.each([
    [["All", "Engineering"]],
    [["Engineering", "All"]],
    [["All", "Business", "Sales"]],
  ])(
    "is rejected when audience pairs All with a specific one: %j",
    (audience) => {
      expect(problemsWithSkill({ ...valid, audience }).join(" ")).toContain(
        "changes nothing",
      );
    },
  );

  it("accepts All on its own", () => {
    expect(problemsWithSkill({ ...valid, audience: ["All"] })).toEqual([]);
  });

  // "is missing" about a field the author can see sends them looking for the wrong thing.
  it.each([
    ["category", 123],
    ["kind", null],
    ["id", 7],
  ])(
    "tells %s apart from missing when present but not a string",
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
    expect(
      problemsWithSkill({
        id: "x",
        category: "Build",
        kind: "plugin",
        status: "Draft",
        audience: ["Marketing"],
      }),
    ).toHaveLength(4);
  });

  // Without an id the message still has to say which row.
  it("names an unidentified row rather than saying nothing", () => {
    expect(problemsWithSkill({}).join(" ")).toContain("a skill");
  });
});

describe("the published index", () => {
  it("has a well shaped row for every skill, planned ones included", () => {
    for (const skill of skillsData.skills as Record<string, unknown>[]) {
      expect(problemsWithSkill(skill), `${skill.id}`).toEqual([]);
    }
  });
});
