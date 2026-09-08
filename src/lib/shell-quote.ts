/** Wraps a value so a POSIX shell reads it as one literal word. */
export function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", `'\\''`) + "'";
}
