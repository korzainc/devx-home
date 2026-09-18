import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOrgMembership, namesOrg } from "./org";

/**
 * The fixture is the real response, trimmed: a probe with a member's token on 2026-09-18 returned
 * exactly one installation, the organisation's, with `repository_selection: "all"`. Keeping the
 * observed shape is the point, because the whole check rests on those three fields being there.
 */
const real = [
  {
    app_slug: "korza-devx",
    repository_selection: "all",
    account: { login: "korzainc", type: "Organization" },
  },
];

describe("namesOrg", () => {
  it("accepts the installation a member actually sees", () => {
    expect(namesOrg(real)).toBe(true);
  });

  it("turns away an account with no installations", () => {
    // What a GitHub user outside the organisation gets: a valid token, an empty list.
    expect(namesOrg([])).toBe(false);
  });

  it("wants the organisation, not a user of the same name", () => {
    expect(
      namesOrg([
        {
          app_slug: "korza-devx",
          account: { login: "korzainc", type: "User" },
        },
      ]),
    ).toBe(false);
  });

  it("wants our App, not any App installed on the organisation", () => {
    // Otherwise anybody who can install a third-party App on a shared organisation could mint
    // themselves an installation that passes.
    expect(
      namesOrg([
        {
          app_slug: "some-other-app",
          account: { login: "korzainc", type: "Organization" },
        },
      ]),
    ).toBe(false);
  });

  it("wants this organisation and not another", () => {
    expect(
      namesOrg([
        {
          app_slug: "korza-devx",
          account: { login: "not-korzainc", type: "Organization" },
        },
      ]),
    ).toBe(false);
  });

  it("reads the login case-insensitively", () => {
    // GitHub keeps the case an organisation was created with and compares logins without it.
    expect(
      namesOrg([
        {
          app_slug: "korza-devx",
          account: { login: "KorzaInc", type: "Organization" },
        },
      ]),
    ).toBe(true);
  });

  it("survives fields being absent", () => {
    expect(namesOrg([{}, { account: null }, { app_slug: "korza-devx" }])).toBe(
      false,
    );
  });
});

describe("fetchOrgMembership", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respond(status: number, body: unknown) {
    // Typed as `fetch` itself so the recorded calls carry its argument types, which is what lets
    // the assertions below read the URL and the headers.
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(body), { status }),
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("asks GitHub with the token it was handed", async () => {
    const fetchMock = respond(200, { total_count: 1, installations: real });

    await expect(fetchOrgMembership("gho_token")).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/user/installations");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer gho_token");
  });

  it("reports a member with no installations as not a member", async () => {
    respond(200, { total_count: 0, installations: [] });
    await expect(fetchOrgMembership("gho_token")).resolves.toBe(false);
  });

  it("throws rather than denying when GitHub refuses", async () => {
    // 401 on a revoked token, 403 on a rate limit. Neither is evidence about the organisation, and
    // returning false here would write "not a member" onto everyone during an outage.
    respond(403, { message: "API rate limit exceeded" });
    await expect(fetchOrgMembership("gho_token")).rejects.toThrow("403");
  });

  it("throws when the response has no installations array", async () => {
    respond(200, { total_count: 1 });
    await expect(fetchOrgMembership("gho_token")).rejects.toThrow(
      "no installations array",
    );
  });
});
