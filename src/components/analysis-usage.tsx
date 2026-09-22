import { headers } from "next/headers";
import { getSession } from "@/lib/session";
import { isOrgMember } from "@/lib/membership";
import { readAnalysisUsage } from "@/lib/analysis-usage";

export async function AnalysisUsage() {
  let usage;
  try {
    const session = await getSession();
    if (!session || !(await isOrgMember(await headers(), session.user)))
      return null;
    usage = await readAnalysisUsage();
  } catch {
    return null;
  }
  return (
    <p className="text-xs text-ink-muted" aria-label="Internal analysis usage">
      {usage.repositories} unique repositories analysed · {usage.runs} total
      runs
    </p>
  );
}
