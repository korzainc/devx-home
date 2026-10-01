import { headers } from "next/headers";
import { getBaseline, tools } from "@/lib/catalogue";
import { getLlmConfig } from "@/lib/gap-llm-config";
import { runAnalysis } from "@/lib/gap/run";
import { isOrgMember } from "@/lib/membership";
import { getGitHubToken, getSession } from "@/lib/session";

// This route's execution budget, made explicit rather than left to whatever Vercel's own default
// happens to be. Must clear the LLM pass's own 30s client timeout with margin for the rest of the
// route's work (repo fetch, deterministic analysis).
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
  const token = await getGitHubToken();
  if (!token) {
    return Response.json(
      { error: "Log in with GitHub to analyze a repository." },
      { status: 401 },
    );
  }

  // Defense-in-depth: `src/proxy.ts` already requires org membership upstream of this route ever
  // running, so this repeats that check rather than relying on it, in case a future change to the
  // proxy matcher or a middleware-bypass bug ever lets a request reach here without it.
  const session = await getSession();
  if (!session || !(await isOrgMember(await headers(), session.user))) {
    return Response.json(
      { error: "Log in with GitHub to analyze a repository." },
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

  return result.ok
    ? Response.json(result.analysis)
    : Response.json({ error: result.error }, { status: result.status });
}
