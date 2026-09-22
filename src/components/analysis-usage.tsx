import { readAnalysisUsage } from "@/lib/analysis-usage";

export async function AnalysisUsage() {
  let usage;
  try {
    usage = await readAnalysisUsage();
  } catch {
    return null;
  }
  return (
    <p
      className="w-fit rounded-lg border border-accent/50 bg-accent-wash px-4 py-2 text-sm font-medium text-ink"
      aria-label="Analysis usage"
    >
      {usage.repositories} unique repositories analysed · {usage.runs} total
      runs
    </p>
  );
}
