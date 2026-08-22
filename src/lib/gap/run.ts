import { analyze } from "./analyze";
import { GitHubError, loadSnapshot, parseRepoRef } from "./github";
import type { Analysis, AnalysisTool, Baseline } from "./types";

export type RunResult =
  | { ok: true; analysis: Analysis }
  | { ok: false; status: number; error: string };

function statusFor(error: GitHubError) {
  if (error.status === 404) return 404;
  // A rejected token is a deployment misconfiguration, not a bad request.
  if (error.status === 401) return 500;
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
  const ref = parseRepoRef(repo);
  if (!ref) {
    return {
      ok: false,
      status: 400,
      error: "Expected a GitHub repository URL or an owner/repo pair.",
    };
  }

  try {
    const snapshot = await loadSnapshot(ref, token, catalogue.baseline);
    return { ok: true, analysis: analyze(snapshot, catalogue) };
  } catch (error) {
    if (error instanceof GitHubError) {
      return { ok: false, status: statusFor(error), error: error.message };
    }
    throw error;
  }
}
