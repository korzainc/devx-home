import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

// Stands in for Better Auth, which builds its context asynchronously: with no secret the
// constructor returns fine and the rejection surfaces on the awaited call, so a guard that lets
// this through fails every page the header renders on rather than just the signed-in state.
const api = {
  getSession: vi.fn(async () => ({ user: { name: "Ada" } })),
  listUserAccounts: vi.fn(async () => []),
};
const getAuth = vi.fn(() => ({ api }));
vi.mock("./auth", () => ({ getAuth }));

/** Re-imported per test so the module reads whatever env the case has just stubbed. */
async function loadSession() {
  vi.resetModules();
  return import("./session");
}

// Values Better Auth genuinely accepts. BETTER_AUTH_SECRETS is the versioned form and rejects
// anything that is not `<version>:<secret>`, so a bare string here would assert the opposite of
// what production does and pass only because `./auth` is mocked.
const acceptedSecrets = [
  ["BETTER_AUTH_SECRET", "a-secret"],
  ["AUTH_SECRET", "a-secret"],
  ["BETTER_AUTH_SECRETS", "0:a-secret"],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  // The suite inherits whatever the shell exported, so every case starts from a known-empty slate.
  // NODE_ENV is production because that is the only environment where Better Auth insists on a
  // secret, and so the only one where the guard withholds a session over a missing one. Vitest
  // would otherwise leave it as "test" and every case here would take the relaxed path.
  for (const [key] of acceptedSecrets) vi.stubEnv(key, "");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("NODE_ENV", "production");
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
  // present and the old DATABASE_URL-only guard waved the request through to a lookup that
  // rejected, 500ing the whole site over a session the catalogue and roadmap never needed.
  it("returns null in production when the database is set but no secret is", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://example/db");
    const { getSession } = await loadSession();

    await expect(getSession()).resolves.toBeNull();
    expect(getAuth).not.toHaveBeenCalled();
  });

  // Better Auth only refuses a missing secret in production; elsewhere it falls back to a built-in
  // default and signs people in. Withholding a session here too would leave `next dev` against a
  // database permanently signed out with nothing logged to explain it.
  it("still consults auth with no secret outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DATABASE_URL", "postgres://example/db");
    const { getSession } = await loadSession();

    await expect(getSession()).resolves.toEqual({ user: { name: "Ada" } });
    expect(getAuth).toHaveBeenCalled();
  });

  it.each(acceptedSecrets)(
    "consults auth in production once the database and %s are set",
    async (key, value) => {
      vi.stubEnv("DATABASE_URL", "postgres://example/db");
      vi.stubEnv(key, value);
      const { getSession } = await loadSession();

      await expect(getSession()).resolves.toEqual({ user: { name: "Ada" } });
      expect(getAuth).toHaveBeenCalled();
    },
  );
});

describe("getGitHubToken", () => {
  it("returns null on an unconfigured deployment, without constructing auth", async () => {
    const { getGitHubToken } = await loadSession();

    await expect(getGitHubToken()).resolves.toBeNull();
    expect(getAuth).not.toHaveBeenCalled();
  });

  // listUserAccounts throws rather than returning nothing when nobody is signed in, so the session
  // has to be checked first even where auth is configured perfectly well.
  it("returns null for a signed-out visitor without listing accounts", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://example/db");
    vi.stubEnv("BETTER_AUTH_SECRET", "a-secret");
    api.getSession.mockResolvedValueOnce(null as never);
    const { getGitHubToken } = await loadSession();

    await expect(getGitHubToken()).resolves.toBeNull();
    expect(api.listUserAccounts).not.toHaveBeenCalled();
  });
});
