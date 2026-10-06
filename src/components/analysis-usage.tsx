import { headers } from "next/headers";
import { readAnalysisUsage } from "@/lib/analysis-usage";
import { isOrgMember } from "@/lib/membership";
import { getSession } from "@/lib/session";

export async function AnalysisUsage({
  recorded,
}: {
  recorded?: Promise<void>;
} = {}) {
  let usage;
  try {
    // The public report can analyse open repositories, but these totals also
    // include private repositories. Apply the portal gate before reading them.
    const session = await getSession();
    if (!session || !(await isOrgMember(await headers(), session.user)))
      return null;
    await recorded;
    usage = await readAnalysisUsage();
  } catch {
    return null;
  }
  return (
    <p
      className="w-fit max-w-full rounded-lg border border-line-strong bg-surface-raised px-4 py-2 text-sm leading-5 text-ink-muted"
      aria-label="Site-wide analysis usage"
    >
      <strong className="font-semibold tabular-nums text-ink">
        {usage.repositories}
      </strong>{" "}
      {usage.repositories === 1 ? "repository" : "repositories"} analysed ·{" "}
      <strong className="font-semibold tabular-nums text-ink">
        {usage.runs}
      </strong>{" "}
      total {usage.runs === 1 ? "run" : "runs"}{" "}
      <span className="ml-2 text-xs text-ink-faint">Members only</span>
    </p>
  );
}
