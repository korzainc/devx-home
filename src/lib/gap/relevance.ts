/** Whether a tool with these capabilities is genuinely relevant to a stack, meaning at
 * least one of its capabilities is in that stack's own capability list. Takes the plain
 * list rather than a full BaselineStack: nothing here needs markers, extensions, or which
 * tool id is recommended, only which capabilities the stack actually names. */
export function isRelevantToStack(
  tool: { capabilities: string[] },
  stackCapabilities: string[],
): boolean {
  const named = new Set(stackCapabilities);
  return tool.capabilities.some((capability) => named.has(capability));
}
