import { headers } from "next/headers";
import { readAnalysisUsage } from "@/lib/analysis-usage";
import { isOrgMember } from "@/lib/membership";
import { getSession } from "@/lib/session";

export async function AnalysisUsage() {
  let usage;
  try {
    // The public report can analyse open repositories, but these totals also
    // include private repositories. Apply the portal gate before reading them.
    const session = await getSession();
    if (!session || !(await isOrgMember(await headers(), session.user)))
      return null;
    usage = await readAnalysisUsage();
  } catch {
    return null;
  }
  return (
    <p
      className="w-fit rounded-lg border border-line-strong bg-surface-raised px-4 py-2 text-sm font-medium text-ink"
      aria-label="Analysis usage"
    >
      {usage.repositories} unique repositories analysed · {usage.runs} total
      runs
    </p>
  );
}
