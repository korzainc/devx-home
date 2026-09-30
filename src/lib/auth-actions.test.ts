import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  signIn: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));
vi.mock("./auth", () => ({
  getAuth: () => ({ api: { signInSocial: mocks.signIn } }),
}));
import { signInWithGitHub } from "./auth-actions";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  mocks.headers.mockResolvedValue(new Headers({ host: "127.0.0.1:3000" }));
  mocks.signIn.mockResolvedValue({
    url: "https://github.com/login/oauth/authorize",
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("guards sign-in from the coverage page or any server-action form before creating state", async () => {
  const form = new FormData();
  form.set("next", "/ci-coverage?repo=korzainc%2Fcodezen");
  await expect(signInWithGitHub(form)).rejects.toThrow(
    "redirect:http://localhost:3000/login?next=%2Fci-coverage%3Frepo%3Dkorzainc%252Fcodezen",
  );
  expect(mocks.signIn).not.toHaveBeenCalled();
});

it.each([
  "//evil.test",
  "/\\evil.test",
  "https://evil.test",
  "/\t/evil.test",
  "/\n/evil.test",
  "/\r/evil.test",
])("rejects an external return path: %s", async (target) => {
  const form = new FormData();
  form.set("next", target);
  await expect(signInWithGitHub(form)).rejects.toThrow(
    "redirect:http://localhost:3000/login?next=%2F",
  );
  expect(mocks.redirect).toHaveBeenCalledWith(
    "http://localhost:3000/login?next=%2F",
  );
  expect(mocks.signIn).not.toHaveBeenCalled();
});

it("keeps normal sign-in on the configured local host", async () => {
  mocks.headers.mockResolvedValue(new Headers({ host: "localhost:3000" }));
  await expect(signInWithGitHub(new FormData())).rejects.toThrow(
    "redirect:https://github.com/login/oauth/authorize",
  );
  expect(mocks.signIn).toHaveBeenCalledOnce();
});
