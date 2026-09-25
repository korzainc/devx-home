import { afterEach, expect, it, vi } from "vitest";
import { localSkillsPreview, skillsPreviewPath } from "./local-skills-preview";
afterEach(() => vi.unstubAllEnvs());
it("requires an explicit local development opt-in", () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("KORZA_LOCAL_SKILLS_PREVIEW", "1");
  vi.stubEnv("VERCEL", "");
  expect(localSkillsPreview("127.0.0.1:3000")).toBe(true);
  expect(localSkillsPreview("localhost:3000")).toBe(true);
  for (const host of [
    null,
    "example.com",
    "localhost.evil.com",
    "127.0.0.1.evil.com",
  ])
    expect(localSkillsPreview(host)).toBe(false);
  vi.stubEnv("NODE_ENV", "production");
  expect(localSkillsPreview("localhost:3000")).toBe(false);
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VERCEL", "1");
  expect(localSkillsPreview("localhost:3000")).toBe(false);
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("KORZA_LOCAL_SKILLS_PREVIEW", "");
  expect(localSkillsPreview("localhost:3000")).toBe(false);
});
it("limits preview to catalogue and plugin details", () => {
  for (const path of ["/skills", "/skills/humanizer"])
    expect(skillsPreviewPath(path)).toBe(true);
  for (const path of [
    "/",
    "/api/telemetry/logs",
    "/skills/humanizer/secret",
    "/skills-other",
  ])
    expect(skillsPreviewPath(path)).toBe(false);
});
