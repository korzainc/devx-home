// Shared by the shape checks over the plugin rows and the skill rows arriving in `index.json`,
// which hold both to the same few rules.

/** A type guard, so callers narrow rather than cast. */
export function isFilled(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Membership against a readonly literal tuple, without widening it at every call. */
export function isOneOf(
  permitted: readonly string[],
  value: unknown,
): value is string {
  return typeof value === "string" && permitted.includes(value);
}
