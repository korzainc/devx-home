const warned = new Set<string>();

/** Logs `message` via `console.warn` at most once per distinct `key` for the life of this module
 * instance - shared by every module-level "an env value or model id was invalid/unrecognized"
 * warning in this codebase, so a value read on every request doesn't warn on every request. */
export function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}
