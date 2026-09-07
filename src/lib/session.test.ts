import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

// Stands in for Better Auth's real behaviour. betterAuth() does not warn and carry on when it
// cannot resolve a secret, it throws from its constructor, so any guard that lets the call through
// takes down every page the header renders on rather than just the signed-in state.
const api = { getSession: vi.fn(async () => ({ user: { name: "Ada" } })) };
const getAuth = vi.fn(() => ({ api }));
vi.mock("./auth", () => ({ getAuth }));

/** Re-imported per test so the module reads whatever env the case has just stubbed. */
async function loadSession() {
  vi.resetModules();
  return import("./session");
}

const authEnv = [
  "BETTER_AUTH_SECRET",
  "AUTH_SECRET",
  "BETTER_AUTH_SECRETS",
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  // The suite inherits whatever the shell exported, so every case starts from a known-empty slate.
  for (const key of ["DATABASE_URL", ...authEnv]) vi.stubEnv(key, "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getSession", () => {
  it("returns null with no database, without constructing auth", async () => {
    const { getSession } = await loadSession();

    await expect(getSession()).resolves.toBeNull();
    expect(getAuth).not.toHaveBeenCalled();
  });

  // The preview outage: Vercel scopes the Neon variables to every environment, so DATABASE_URL was
  // present and the old DATABASE_URL-only guard waved the request through to a constructor that
  // threw, 500ing the whole site over a session the catalogue and roadmap never needed.
  it("returns null when the database is set but no auth secret is", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://example/db");
    const { getSession } = await loadSession();

    await expect(getSession()).resolves.toBeNull();
    expect(getAuth).not.toHaveBeenCalled();
  });

  it.each(authEnv)(
    "consults auth once the database and %s are set",
    async (key) => {
      vi.stubEnv("DATABASE_URL", "postgres://example/db");
      vi.stubEnv(key, "a-secret");
      const { getSession } = await loadSession();

      await expect(getSession()).resolves.toEqual({ user: { name: "Ada" } });
      expect(getAuth).toHaveBeenCalled();
    },
  );
});

describe("getGitHubToken", () => {
  it("returns null without a session, without constructing auth", async () => {
    const { getGitHubToken } = await loadSession();

    await expect(getGitHubToken()).resolves.toBeNull();
    expect(getAuth).not.toHaveBeenCalled();
  });
});
