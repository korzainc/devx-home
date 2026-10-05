import "server-only";
import { headers } from "next/headers";
import { getLlmConfig } from "./gap-llm-config";
import { isOrgMember } from "./membership";
import { getSession } from "./session";
import type { LlmConfig } from "./gap/llm/types";

/**
 * The LLM pass's config when the viewer is a signed-in Korza org member, else undefined.
 * `/ci-coverage` is an open path, so the proxy never checks membership there. Never throws.
 */
export async function getMemberLlmConfig(): Promise<LlmConfig | undefined> {
  try {
    const config = getLlmConfig();
    if (!config?.enabled) return undefined;
    const session = await getSession();
    // A stored "no" skips the GitHub re-check, so non-members cost nothing extra.
    if (!session?.user.orgMember) return undefined;
    return (await isOrgMember(await headers(), session.user))
      ? config
      : undefined;
  } catch (error) {
    console.error(
      "gap LLM pass: membership check failed, skipping the pass",
      error,
    );
    return undefined;
  }
}
