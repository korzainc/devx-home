import { headers } from "next/headers";
import { localSkillsPreview } from "@/lib/local-skills-preview";
export async function LocalSkillsPreviewNotice() {
  if (!localSkillsPreview((await headers()).get("host"))) return null;
  return (
    <p className="rounded-lg border border-line px-4 py-2 text-xs text-ink-muted">
      Local monitoring preview · test totals, not adoption figures · company
      sign-in not validated
    </p>
  );
}
