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
      className="text-sm leading-5 text-ink-muted"
      aria-label="Site-wide analysis usage"
    >
      Analysed {usage.repositories}{" "}
      {usage.repositories === 1 ? "repository" : "repositories"} across{" "}
      {usage.runs} {usage.runs === 1 ? "run" : "runs"}
      <span className="ml-2 text-xs text-ink-faint">Members only</span>
    </p>
  );
}
