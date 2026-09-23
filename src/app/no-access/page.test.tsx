import { afterEach, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", () => ({ getSession }));
vi.mock("@/lib/auth-actions", () => ({ signOut: vi.fn() }));
import NoAccessPage, { metadata } from "./page";
afterEach(() => vi.clearAllMocks());
it("explains the GitHub App access check without asserting organisation non-membership", async () => {
  getSession.mockResolvedValue(null);
  const html = renderToString(await NoAccessPage());
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
    getSession.mockResolvedValue({ user: { name: "person", email } });
    const html = renderToString(await NoAccessPage());
    expect(html).toContain("Logged in as");
    expect(html).toContain(">person</p>");
    expect(html).not.toContain(email);
  },
);
it("keeps an actual account email visible", async () => {
  getSession.mockResolvedValue({
    user: { name: "person", email: "person@example.test" },
  });
  expect(renderToString(await NoAccessPage())).toContain("person@example.test");
});
