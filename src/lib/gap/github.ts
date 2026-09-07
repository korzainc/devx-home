import { filesToRead } from "./detect";
import { RepoReadError } from "./types";
import type { Baseline, RepoReader, RepoRef, RepoSnapshot } from "./types";

// Reads a repo over the API rather than cloning it. A clone needs a writable disk and pulls the
// whole history for the sake of a dozen files, neither of which suits a serverless function.
//
// The token is a parameter on every function here, never read from the environment. A null one
// means send no Authorization header at all, which GitHub answers for public repositories and
// refuses for everything else. That is what lets a signed-out visitor analyze an open source repo
// without this file ever holding a credential of its own to fall back on.

const api = "https://api.github.com";

/** Accepts a GitHub URL, an `owner/repo` pair, or either with a trailing `.git`. */
export function parseRepoRef(input: string): RepoRef | null {
  const trimmed = input
    .trim()
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
  if (!trimmed) return null;

  const path = trimmed
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/^git@github\.com:/i, "");

  const match = /^([\w.-]+)\/([\w.-]+)$/.exec(path);
  if (!match) return null;

  // A segment of nothing but dots is not a name GitHub issues, and `..` would resolve the request
  // URL onto a different endpoint entirely: `../user` would reach /user rather than a repo. Only
  // all-dot segments are rejected, because a leading dot is legitimate in names like `.github`.
  if (/^\.+$/.test(match[1]) || /^\.+$/.test(match[2])) return null;

  return { provider: "github", owner: match[1], repo: match[2] };
}

function headers(token: string | null): HeadersInit {
  return {
    accept: "application/vnd.github+json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    "x-github-api-version": "2022-11-28",
    "user-agent": "korza-devx-home",
  };
}

/**
 * Whether GitHub turned this request down because the hourly quota is spent, as opposed to the
 * other things it serves a 403 for. Only a spent primary quota reports zero remaining, so a repo
 * blocked for some other reason, and a secondary limit on request rate, both fall through to the
 * generic message rather than being reported as an hourly quota that has to wait for a reset.
 */
function limitExhausted(response: Response): boolean {
  return response.headers.get("x-ratelimit-remaining") === "0";
}

async function request(url: string, token: string | null, accept?: string) {
  const response = await fetch(url, {
    headers: accept
      ? { ...headers(token), accept }
      : { ...headers(token), accept: "application/vnd.github+json" },
    // The point of the feature is the repo's current state, so the data cache must not serve
    // an earlier read back.
    cache: "no-store",
  });

  if (response.ok) return response;

  throw new RepoReadError(response.status, reasonFor(response, token));
}

// Every message here is read by whoever typed the repo name, so each one has to be true for the
// credential that was actually used. The anonymous variants matter most: the quota is 60 requests
// an hour for the whole deployment's IP, so a signed-out visitor meets a spent limit far sooner
// than a signed-in one meets theirs, and the remedy is different too.
function reasonFor(response: Response, token: string | null): string {
  // GitHub returns 404 rather than 403 for a repo the caller cannot reach, so missing and
  // unreadable are indistinguishable and the message has to cover both. Anonymously that means
  // any private repo, which is the common case worth naming first.
  if (response.status === 404) {
    return token
      ? "Repository not found, or the Korza DevX app is not installed on it. Ask a korzainc owner to add it to the installation."
      : "No public repository by that name. If it is private, log in and it will be read with your own access.";
  }

  if (response.status === 401)
    return "GitHub rejected the token. Log in again.";

  if (response.status === 403 || response.status === 429) {
    if (!limitExhausted(response)) {
      return "GitHub declined the request. Try again shortly.";
    }
    return token
      ? "You have used up your hourly GitHub API quota. Try again shortly."
      : "Anonymous reads share one hourly GitHub quota for the whole site, and it is used up. Log in to analyze with your own, which is far larger.";
  }

  return `GitHub returned ${response.status}.`;
}

async function fetchDefaultBranch(
  ref: RepoRef,
  token: string | null,
): Promise<string> {
  const response = await request(
    `${api}/repos/${ref.owner}/${ref.repo}`,
    token,
  );
  const body = (await response.json()) as { default_branch?: string };
  if (!body.default_branch) {
    throw new RepoReadError(502, "Repository has no default branch.");
  }
  return body.default_branch;
}

async function fetchPaths(
  ref: RepoRef,
  branch: string,
  token: string | null,
): Promise<string[]> {
  const response = await request(
    `${api}/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    token,
  );
  const body = (await response.json()) as {
    tree?: { path: string; type: string }[];
  };
  return (body.tree ?? [])
    .filter((entry) => entry.type === "blob")
    .map((entry) => entry.path);
}

async function fetchFile(
  ref: RepoRef,
  branch: string,
  path: string,
  token: string | null,
): Promise<string> {
  const response = await request(
    `${api}/repos/${ref.owner}/${ref.repo}/contents/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}?ref=${encodeURIComponent(branch)}`,
    token,
    "application/vnd.github.raw",
  );
  return response.text();
}

/**
 * One tree read, then a read per file the baseline makes relevant. `filesToRead` caps the count,
 * so this stays a fixed handful of requests regardless of repo size.
 */
export async function loadSnapshot(
  ref: RepoRef,
  token: string | null,
  baseline: Baseline,
): Promise<RepoSnapshot> {
  const defaultBranch = await fetchDefaultBranch(ref, token);
  const paths = await fetchPaths(ref, defaultBranch, token);
  const wanted = filesToRead(paths, baseline);

  const contents = await Promise.all(
    wanted.map(async (path) => {
      // One unreadable file should not sink the whole report: a submodule pointer or a file
      // above the contents endpoint's size limit are both plausible and neither is fatal.
      try {
        return [
          path,
          await fetchFile(ref, defaultBranch, path, token),
        ] as const;
      } catch {
        return null;
      }
    }),
  );

  return {
    ref,
    defaultBranch,
    paths,
    files: Object.fromEntries(contents.filter((entry) => entry !== null)),
  };
}

export const githubReader: RepoReader = {
  parseRef: parseRepoRef,
  loadSnapshot,
};
