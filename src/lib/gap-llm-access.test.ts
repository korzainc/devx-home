import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMemberLlmConfig } from "./gap-llm-access";

const getLlmConfig = vi.hoisted(() => vi.fn());
vi.mock("@/lib/gap-llm-config", () => ({ getLlmConfig }));

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", () => ({ getSession }));

const isOrgMember = vi.hoisted(() => vi.fn());
vi.mock("@/lib/membership", () => ({ isOrgMember }));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const config = { enabled: true, model: "m" };
const user = { id: "u1", orgMember: true, orgCheckedAt: new Date() };

describe("getMemberLlmConfig", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    getLlmConfig.mockReturnValue(config);
    getSession.mockResolvedValue({ user });
    isOrgMember.mockResolvedValue(true);
  });

  it.each([
    {
      name: "no provider",
      arrange: () => getLlmConfig.mockReturnValue(undefined),
      sessionRead: false,
      membershipRead: false,
    },
    {
      name: "the pass disabled",
      arrange: () =>
        getLlmConfig.mockReturnValue({ ...config, enabled: false }),
      sessionRead: false,
      membershipRead: false,
    },
    {
      name: "no session",
      arrange: () => getSession.mockResolvedValue(null),
      sessionRead: true,
      membershipRead: false,
    },
    {
      name: "a stored non-member, without a GitHub re-check",
      arrange: () =>
        getSession.mockResolvedValue({ user: { ...user, orgMember: false } }),
      sessionRead: true,
      membershipRead: false,
    },
    {
      name: "a failed membership check",
      arrange: () => isOrgMember.mockResolvedValue(false),
      sessionRead: true,
      membershipRead: true,
    },
    {
      name: "a session lookup that throws",
      arrange: () => getSession.mockRejectedValue(new Error("db down")),
      sessionRead: true,
      membershipRead: false,
    },
    {
      name: "a membership check that throws",
      arrange: () => isOrgMember.mockRejectedValue(new Error("db down")),
      sessionRead: true,
      membershipRead: true,
    },
  ])(
    "returns undefined for $name",
    async ({ arrange, sessionRead, membershipRead }) => {
      arrange();

      expect(await getMemberLlmConfig()).toBeUndefined();
      expect(getSession).toHaveBeenCalledTimes(sessionRead ? 1 : 0);
      expect(isOrgMember).toHaveBeenCalledTimes(membershipRead ? 1 : 0);
    },
  );

  it("returns the config for a member, checking the session user", async () => {
    expect(await getMemberLlmConfig()).toBe(config);
    expect(isOrgMember).toHaveBeenCalledWith(expect.any(Headers), user);
  });
});
