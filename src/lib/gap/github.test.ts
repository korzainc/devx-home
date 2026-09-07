import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSnapshot, parseRepoRef } from "./github";
import { RepoReadError } from "./types";
import type { Baseline, RepoRef } from "./types";

describe("parseRepoRef", () => {
  it("accepts the forms someone actually pastes", () => {
    const expected = {
      provider: "github",
      owner: "korzainc",
      repo: "devx-home",
    };

    expect(parseRepoRef("korzainc/devx-home")).toEqual(expected);
    expect(parseRepoRef("https://github.com/korzainc/devx-home")).toEqual(
      expected,
    );
    expect(parseRepoRef("http://www.github.com/korzainc/devx-home")).toEqual(
      expected,
    );
    expect(parseRepoRef("https://github.com/korzainc/devx-home/")).toEqual(
      expected,
    );
    expect(parseRepoRef("https://github.com/korzainc/devx-home.git")).toEqual(
      expected,
    );
    expect(parseRepoRef("git@github.com:korzainc/devx-home.git")).toEqual(
      expected,
    );
    expect(parseRepoRef("  korzainc/devx-home  ")).toEqual(expected);
  });

  it("rejects anything that is not a repository", () => {
    expect(parseRepoRef("")).toBeNull();
    expect(parseRepoRef("   ")).toBeNull();
    expect(parseRepoRef("korzainc")).toBeNull();
    expect(parseRepoRef("not a repo")).toBeNull();
    // A path deeper than the repo root is not a repo, even though it starts like one.
    expect(
      parseRepoRef("https://github.com/korzainc/devx-home/tree/main"),
    ).toBeNull();
    expect(parseRepoRef("https://gitlab.com/korzainc/devx-home")).toBeNull();
  });

  it("rejects dot segments that would redirect the API request", () => {
    // `/repos/../user` normalises to `/user`, so these would read the caller's own account and
    // the org list instead of a repository.
    expect(parseRepoRef("../user")).toBeNull();
    expect(parseRepoRef("../organizations")).toBeNull();
    expect(parseRepoRef("korzainc/..")).toBeNull();
    expect(parseRepoRef("./user")).toBeNull();

    // A leading dot is still a real repository name.
    expect(parseRepoRef("korzainc/.github")).toEqual({
      provider: "github",
      owner: "korzainc",
      repo: ".github",
    });
  });
});

const ref: RepoRef = { provider: "github", owner: "korzainc", repo: "example" };

// Only `markers` matters here: it is what `filesToRead` matches the tree against, so a stack
// marked by package.json makes loadSnapshot fetch exactly the one file.
const baseline: Baseline = {
  categories: [],
  capabilities: {},
  universal: [],
  stacks: [
    {
      id: "javascript",
      label: "JavaScript",
      markers: ["package.json"],
      expects: {},
    },
  ],
};

function ok(body: unknown, type = "application/json") {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: 200,
    headers: { "content-type": type },
  });
}

/** The three reads loadSnapshot makes, keyed by the distinguishing part of the URL. */
function repoResponses() {
  return (url: string) => {
    if (url.includes("/git/trees/")) {
      return ok({ tree: [{ path: "package.json", type: "blob" }] });
    }
    if (url.includes("/contents/")) return ok("{}", "text/plain");
    return ok({ default_branch: "main" });
  };
}

function stubFetch(handler: (url: string) => Response) {
  // Typed with both parameters even though the handler only needs the URL, so `mock.calls` keeps
  // the init object and `sentAuth` can read the headers back off it.
  const fetchMock = vi.fn<
    (url: string | URL, init?: RequestInit) => Promise<Response>
  >(async (url) => handler(String(url)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Every Authorization header sent across a run, absent ones included. */
function sentAuth(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls.map(([, init]) => {
    const headers = init?.headers as Record<string, string> | undefined;
    return headers?.authorization;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadSnapshot", () => {
  // The point of the public path: with no token there must be no Authorization header at all.
  // An empty or "Bearer null" one would make GitHub reject the request outright, which would
  // read as the repo being missing rather than as a bug here.
  it("sends no Authorization header when there is no token", async () => {
    const fetchMock = stubFetch(repoResponses());

    const snapshot = await loadSnapshot(ref, null, baseline);

    expect(snapshot.defaultBranch).toBe("main");
    expect(snapshot.paths).toEqual(["package.json"]);
    expect(sentAuth(fetchMock)).toEqual([undefined, undefined, undefined]);
    // The whole run, so a token cannot leak in on a later request than the first.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("sends the token on every request when there is one", async () => {
    const fetchMock = stubFetch(repoResponses());

    await loadSnapshot(ref, "a-token", baseline);

    expect(sentAuth(fetchMock)).toEqual([
      "Bearer a-token",
      "Bearer a-token",
      "Bearer a-token",
    ]);
  });
});

describe("loadSnapshot failures", () => {
  /** GitHub's own shape for a refusal: the status plus whatever quota is left. */
  function refusal(status: number, remaining: string | null) {
    return new Response("{}", {
      status,
      headers: remaining === null ? {} : { "x-ratelimit-remaining": remaining },
    });
  }

  async function reasonFrom(token: string | null, response: Response) {
    stubFetch(() => response);
    try {
      await loadSnapshot(ref, token, baseline);
    } catch (error) {
      if (error instanceof RepoReadError) return error;
      throw error;
    }
    throw new Error("expected loadSnapshot to throw");
  }

  // Anonymously a 404 covers a private repo as well as one that does not exist, so the message
  // names both rather than talking about an app installation nobody signed out can act on. It
  // stops short of telling them to log in: the page already puts that in the heading, and saying
  // it twice in one card is how the two paragraphs ended up repeating each other.
  it("explains a 404 differently with and without a token", async () => {
    const anonymous = await reasonFrom(null, refusal(404, null));
    expect(anonymous.status).toBe(404);
    expect(anonymous.message).toContain("private");

    const signedIn = await reasonFrom("a-token", refusal(404, null));
    expect(signedIn.message).toContain("not installed");
  });

  // The fallback the whole feature rests on: 60 requests an hour is shared by every signed-out
  // visitor, so this is the failure they will actually meet, and the page turns it into the
  // sign-in prompt. GitHub says 403 here, and 429 is what that means, so the translation happens
  // in the reader where the header is still readable.
  it("reports a spent anonymous quota as 429 and names it as shared", async () => {
    const error = await reasonFrom(null, refusal(403, "0"));

    expect(error.status).toBe(429);
    expect(error.message).toContain("share one hourly GitHub quota");
    expect(error.message).toContain("used up");
  });

  // Whose quota it was is the whole difference. A signed-in reader has nothing larger to move to,
  // so telling them the shared pool is empty would be both wrong and useless.
  it("points a signed-in reader at their own spent quota, not a shared one", async () => {
    const error = await reasonFrom("a-token", refusal(429, "0"));

    expect(error.status).toBe(429);
    expect(error.message).toContain("your hourly GitHub API quota");
    expect(error.message).not.toContain("share");
  });

  // A 403 is not only a spent quota. Passing it on as one sent the page a status it answers with
  // a login prompt, so a blocked repo produced a card headed "Log in to analyze X" over a body
  // saying to try again shortly. The status is the part that has to differ, not just the message.
  it("does not report a 403 with quota left as a rate limit", async () => {
    const error = await reasonFrom(null, refusal(403, "57"));

    expect(error.status).toBe(502);
    expect(error.message).toBe(
      "GitHub declined the request. Try again shortly.",
    );
  });
});
