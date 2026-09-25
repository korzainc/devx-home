import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  member: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.session }));
vi.mock("@/lib/membership", () => ({ isOrgMember: mocks.member }));
vi.mock("@/lib/auth-actions", () => ({ signOut: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "localhost:3000" }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import Page, { metadata } from "./page";
import { renderToString } from "react-dom/server";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation(() => {
    throw new Error("redirect");
  });
});
it("rechecks a signed-in visitor so a resolved rejection does not trap them", async () => {
  mocks.session.mockResolvedValue({
    user: { id: "u", name: "User", orgMember: false },
  });
  mocks.member.mockResolvedValue(true);
  await expect(Page()).rejects.toThrow("redirect");
  expect(mocks.redirect).toHaveBeenCalledWith("/");
});
it("keeps the rejection for a denied account", async () => {
  mocks.session.mockResolvedValue({
    user: { id: "u", name: "User", orgMember: false },
  });
  mocks.member.mockResolvedValue(false);
  await Page();
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it("sends a signed-out visitor to login without clearing their session", async () => {
  mocks.session.mockResolvedValue(null);
  await expect(Page()).rejects.toThrow("redirect");
  expect(mocks.redirect).toHaveBeenCalledWith("/login");
  expect(mocks.member).not.toHaveBeenCalled();
});

it("explains the GitHub App access check without asserting organisation non-membership", async () => {
  mocks.session.mockResolvedValue({
    user: { id: "u", name: "person", orgMember: false },
  });
  const html = renderToString(await Page());
  expect(html).toContain("Sign-in worked");
  expect(html).toContain("could not confirm Korza access");
  expect(html).toContain("maintainer");
  expect(html).toContain("Korza repositories");
  expect(html).toContain("korza-devx");
  expect(html).not.toContain("not in the Korza GitHub organisation");
  expect(html).not.toContain("within a minute");
  expect(metadata.description).toContain("GitHub App");
});
it.each([
  "person@users.noreply.github.com",
  "123+person@USERS.NOREPLY.GITHUB.COM",
])(
  "hides a placeholder email while keeping the account name: %s",
  async (email) => {
    mocks.session.mockResolvedValue({ user: { name: "person", email } });
    const html = renderToString(await Page());
    expect(html).toContain("Logged in as");
    expect(html).toContain(">person</p>");
    expect(html).not.toContain(email);
  },
);
it("keeps an actual account email visible", async () => {
  mocks.session.mockResolvedValue({
    user: { name: "person", email: "person@example.test" },
  });
  expect(renderToString(await Page())).toContain("person@example.test");
});
