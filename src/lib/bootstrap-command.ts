import { shellQuote } from "@/lib/shell-quote";

/** Install from a publicly accessible setup URL. */
export function bootstrapCommand(url: string): string {
  return `curl -fsSL ${shellQuote(url)} | sh`;
}
