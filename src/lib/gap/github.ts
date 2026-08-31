import { filesToRead } from "./detect";
import { RepoReadError } from "./types";
import type { Baseline, RepoReader, RepoRef, RepoSnapshot } from "./types";

// Reads a repo over the API rather than cloning it. A clone needs a writable disk and pulls the
// whole history for the sake of a dozen files, neither of which suits a serverless function.
//
// The token is a parameter on every function here, never read from the environment. Swapping the
// shared PAT for a per-user OAuth token then changes only the caller.

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

function headers(token: string): HeadersInit {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "korza-devx-home",
  };
}

async function request(url: string, token: string, accept?: string) {
  const response = await fetch(url, {
    headers: accept
      ? { ...headers(token), accept }
      : { ...headers(token), accept: "application/vnd.github+json" },
    // The point of the feature is the repo's current state, so the data cache must not serve
    // an earlier read back.
    cache: "no-store",
  });

  if (response.ok) return response;

  // GitHub returns 404 rather than 403 for a private repo the token cannot reach, so a missing
  // repo and an unreachable one are indistinguishable and the message has to cover both. Public
  // repos are readable without an installation; private ones need the App installed on them.
  const reason =
    response.status === 404
      ? "Repository not found, or the Korza DevX app is not installed on it. Ask a korzainc owner to add it to the installation."
      : response.status === 401
        ? "GitHub rejected the token. Log in again."
        : response.status === 403 || response.status === 429
          ? "GitHub rate limit or access restriction hit. Try again shortly."
          : `GitHub returned ${response.status}.`;

  throw new RepoReadError(response.status, reason);
}

async function fetchDefaultBranch(
  ref: RepoRef,
  token: string,
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
  token: string,
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
  token: string,
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
  token: string,
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
