import { headers } from "next/headers";
import { apiError } from "@/lib/api-errors";
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
  // A thrown lookup (a Neon outage, a misconfigured auth secret) is not the same answer as a null
  // session: the CLI treats `unauthenticated` as "sign in again" and would delete a still-good
  // token over a transient outage.
  let session;
  try {
    session = await getSession();
  } catch (error) {
    console.error("/api/analyze could not read a session.", error);
    return apiError("unavailable", 503);
  }
  if (!session) {
    return apiError("unauthenticated", 401);
  }

  // `src/proxy.ts` already requires org membership; this repeats it in case a proxy
  // change lets a request through. Its own reason: retrying login on 401 would loop
  // forever here, since signing in again can't add an account to the org.
  if (!(await isOrgMember(await headers(), session.user))) {
    return apiError("not_org_member", 403);
  }

  // `getGitHubToken()` returns null for both nobody signed in and a lapsed refresh token, so this
  // check only runs once a session and org membership are already confirmed - otherwise a signed
  // out caller would get this reason instead of `unauthenticated`.
  let token;
  try {
    token = await getGitHubToken();
  } catch (error) {
    console.error("/api/analyze could not read a GitHub token.", error);
    return apiError("unavailable", 503);
  }
  if (!token) {
    return apiError("github_reauth_required", 401);
  }

  const repo = repoFromBody(await request.json().catch(() => null));
  const result = await runAnalysis(
    repo,
    token,
    { tools, baseline: getBaseline() },
    getLlmConfig(),
  );

  if (!result.ok) {
    // A 429 is the reader's own GitHub rate limit, so `error` stays GitHub's raw message
    // rather than going through `apiError`.
    //
    // A 401 here (GitHub rejecting the token at read time) gets the shared
    // `github_reauth_required` message instead of whatever `runAnalysis` said; other
    // statuses aren't part of the CLI's retry contract, so they carry no reason.
    if (result.status === 429) {
      return Response.json(
        { error: result.error, reason: "rate_limited" },
        { status: 429 },
      );
    }
    if (result.status === 401) {
      return apiError("github_reauth_required", 401);
    }
    return Response.json({ error: result.error }, { status: result.status });
  }

  const catalogue = { bundleById, toolNameById, capabilityLabels };
  const fixPrompt = buildFixPrompt(result.analysis, catalogue);
  return Response.json({
    analysis: result.analysis,
    ...(fixPrompt ? { fixPrompt } : {}),
  });
}
