import { analyze } from "./analyze";
import { githubReader } from "./github";
import { RepoReadError } from "./types";
import type { Analysis, AnalysisTool, Baseline, RepoReader } from "./types";

// Adding a provider means adding a reader here. The first one whose `parseRef` recognises the
// input wins, so each reader decides what it owns rather than this list matching on hostnames.
const readers: RepoReader[] = [githubReader];

export type RunResult =
  | { ok: true; analysis: Analysis }
  | { ok: false; status: number; error: string };

function resolve(input: string) {
  for (const reader of readers) {
    const ref = reader.parseRef(input);
    if (ref) return { reader, ref };
  }
  return null;
}

function statusFor(error: RepoReadError) {
  if (error.status === 404) return 404;
  // The token is now the caller's own, so a rejected one means their grant has lapsed rather
  // than the deployment being misconfigured.
  if (error.status === 401) return 401;
  if (error.status === 403 || error.status === 429) return 429;
  return 502;
}

/**
 * One parse, read and diff, shared by the page that renders a report and the route that returns
 * one as JSON. The token stays an argument: nothing in this directory reads the environment.
 */
export async function runAnalysis(
  repo: string,
  token: string,
  catalogue: { tools: AnalysisTool[]; baseline: Baseline },
): Promise<RunResult> {
  const resolved = resolve(repo);
  if (!resolved) {
    return {
      ok: false,
      status: 400,
      error: "Expected a GitHub repository URL or an owner/repo pair.",
    };
  }

  try {
    const snapshot = await resolved.reader.loadSnapshot(
      resolved.ref,
      token,
      catalogue.baseline,
    );
    return { ok: true, analysis: analyze(snapshot, catalogue) };
  } catch (error) {
    if (error instanceof RepoReadError) {
      return { ok: false, status: statusFor(error), error: error.message };
    }
    throw error;
  }
}
