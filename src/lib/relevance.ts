/** Whether a tool is relevant to a stack: true if at least one of its capabilities is in the
 * stack's capability list. Takes a plain list rather than a full BaselineStack since nothing
 * here needs markers, extensions, or which tool id is recommended. */
export function isRelevantToStack(
  tool: { capabilities: string[] },
  stackCapabilities: string[],
): boolean {
  const named = new Set(stackCapabilities);
  return tool.capabilities.some((capability) => named.has(capability));
}
