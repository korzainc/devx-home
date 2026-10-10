import { afterEach, expect, it, vi } from "vitest";
import { PluginSkillsWithUsage } from "./plugin-skills-with-usage";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  member: vi.fn(),
  usage: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/membership", () => ({ isOrgMember: mocks.member }));
vi.mock("@/lib/skill-usage", () => ({ readSkillUsage: mocks.usage }));
afterEach(() => vi.resetAllMocks());
it("does not query counts without portal access", async () => {
  for (const session of [null, { user: { id: "test" } }]) {
    mocks.session.mockResolvedValue(session);
    mocks.member.mockResolvedValue(false);
    const result = PluginSkillsWithUsage({
      plugin: "humanizer",
      skills: [],
    });
    expect(await result.props.usagePromise).toBeUndefined();
  }
  expect(mocks.usage).not.toHaveBeenCalled();
});
it("passes counts after membership succeeds", async () => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(true);
  mocks.usage.mockResolvedValue({ humanizer: { claude: 2 } });
  const result = PluginSkillsWithUsage({ plugin: "humanizer", skills: [] });
  expect(await result.props.usagePromise).toEqual({
    humanizer: { claude: 2 },
  });
});
it("preserves browsing when storage fails", async () => {
  mocks.session.mockResolvedValue({ user: { id: "test" } });
  mocks.member.mockResolvedValue(true);
  mocks.usage.mockRejectedValue(new Error("offline"));
  const result = PluginSkillsWithUsage({ plugin: "humanizer", skills: [] });
  expect(await result.props.usagePromise).toBeUndefined();
});
