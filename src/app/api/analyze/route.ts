import { headers } from "next/headers";
import {
  bundleById,
  capabilityLabels,
  getBaseline,
  toolNameById,
  tools,
} from "@/lib/catalogue";
import { getLlmConfig } from "@/lib/gap-llm-config";
import { buildFixPrompt } from "@/lib/gap/prompt";
import { runAnalysis } from "@/lib/gap/run";
import { isOrgMember } from "@/lib/membership";
import { getGitHubToken, getSession } from "@/lib/session";

// Must clear the LLM pass's 30s client timeout with margin for the repo fetch and analysis.
export const maxDuration = 45;

// The token belongs to whoever is signed in and is handed to `runAnalysis` as an argument.
// Nothing under src/lib/gap touches the environment or the session.
//
// The session is what stops this being an open proxy: `repo` comes from the request body, so
// without it any caller could aim a shared credential at any repository that credential can see.
//
// Deliberately unlike the page, which analyzes public repos with no token at all. Anonymous reads
// leak nothing, but they draw on one 60-per-hour quota shared by the whole deployment, and an
// endpoint that spends it on demand is an easy way to leave the page permanently rate limited.
// Opening this up wants a cost control of its own first.

function repoFromBody(body: unknown): string {
  if (body && typeof body === "object" && "repo" in body) {
    const { repo } = body as { repo: unknown };
    if (typeof repo === "string") return repo;
  }
  return "";
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json(
      {
        error: "Log in with GitHub to analyze a repository.",
        reason: "unauthenticated",
      },
      { status: 401 },
    );
  }

  // `src/proxy.ts` already requires org membership; this repeats it in case a proxy matcher
  // change or bypass lets a request through. Its own reason, distinct from `unauthenticated`:
  // a caller retrying login on 401 would loop forever here, since signing in again as the same
  // account can't make it a member.
  if (!(await isOrgMember(await headers(), session.user))) {
    return Response.json(
      {
        error: "You're not a member of the Korza GitHub organization.",
        reason: "not_org_member",
      },
      { status: 403 },
    );
  }

  // `getGitHubToken()` returns null for both nobody signed in and a lapsed refresh token, so this
  // check only runs once a session and org membership are already confirmed - otherwise a signed
  // out caller would get this reason instead of `unauthenticated`.
  const token = await getGitHubToken();
  if (!token) {
    return Response.json(
      {
        error: "Your GitHub access needs refreshing. Sign in again on the website.",
        reason: "github_reauth_required",
      },
      { status: 401 },
    );
  }

  const repo = repoFromBody(await request.json().catch(() => null));
  const result = await runAnalysis(
    repo,
    token,
    { tools, baseline: getBaseline() },
    getLlmConfig(),
  );

  if (!result.ok) {
    // A 429 here is the reader's own rate limit, not the auth checks above; a 401 is GitHub
    // rejecting the token at read time rather than at the check above, but means the same thing
    // to a caller. Other statuses (400 bad ref, 404 no such repo, 502 upstream failure) aren't
    // part of the CLI's retry contract, so they carry no reason.
    const reason =
      result.status === 429
        ? "rate_limited"
        : result.status === 401
          ? "github_reauth_required"
          : undefined;
    return Response.json(
      { error: result.error, ...(reason ? { reason } : {}) },
      { status: result.status },
    );
  }

  const catalogue = { bundleById, toolNameById, capabilityLabels };
  const fixPrompt = buildFixPrompt(result.analysis, catalogue);
  return Response.json({ analysis: result.analysis, fixPrompt });
}
