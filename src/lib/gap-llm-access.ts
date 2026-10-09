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
    if (!session) return undefined;
    // Only a stored, checked "no" skips GitHub. A never-checked account (null `orgCheckedAt`)
    // is verified once, so a member whose first sign-in is this page still gets the pass.
    if (!session.user.orgMember && session.user.orgCheckedAt) return undefined;
    return (await isOrgMember(await headers(), session.user))
      ? config
      : undefined;
  } catch (error) {
    console.error("gap LLM pass: gating failed, skipping the LLM pass", error);
    return undefined;
  }
}
