import { getPool } from "./db";

export function validRunId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

// Best-effort monitoring must not turn a successful report into an error.
export async function recordAnalysisRun(
  runId: string,
  repoId: number | undefined,
) {
  if (
    !validRunId(runId) ||
    !Number.isSafeInteger(repoId) ||
    !repoId ||
    repoId < 1
  )
    return;
  try {
    await getPool().query({
      text: "insert into gap_analysis_runs (run_id, repo_id) values ($1, $2) on conflict (run_id) do nothing",
      values: [runId, repoId],
      // pg supports this per-query option; its QueryConfig type omits it.
      ...{ query_timeout: 1000 },
    });
  } catch {
    console.warn(
      "Could not record analysis usage; the report is still available.",
    );
  }
}

export async function readAnalysisUsage(): Promise<{
  runs: number;
  repositories: number;
}> {
  const result = await getPool().query<{ runs: number; repositories: number }>({
    text: "select count(*)::int as runs, count(distinct repo_id)::int as repositories from gap_analysis_runs",
    // pg supports this per-query option; its QueryConfig type omits it.
    ...{ query_timeout: 1000 },
  });
  return result.rows[0];
}
