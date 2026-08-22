import { baseline, tools } from "@/lib/catalogue";
import { runAnalysis } from "@/lib/gap/run";

// The token is read here and handed to `runAnalysis` as an argument. Nothing under src/lib/gap
// touches the environment, which is what keeps the swap to a per-user OAuth token local to the
// two callers that read it.
//
// GITHUB_API_TOKEN is a shared credential for this milestone, so the deployment serving this
// route has to stay behind Vercel Authentication until that swap lands.

function repoFromBody(body: unknown): string {
  if (body && typeof body === "object" && "repo" in body) {
    const { repo } = body as { repo: unknown };
    if (typeof repo === "string") return repo;
  }
  return "";
}

export async function POST(request: Request) {
  const token = process.env.GITHUB_API_TOKEN;
  if (!token) {
    return Response.json(
      { error: "GITHUB_API_TOKEN is not set on this deployment." },
      { status: 503 },
    );
  }

  const repo = repoFromBody(await request.json().catch(() => null));
  const result = await runAnalysis(repo, token, { tools, baseline });

  return result.ok
    ? Response.json(result.analysis)
    : Response.json({ error: result.error }, { status: result.status });
}
