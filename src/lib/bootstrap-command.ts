import { shellQuote } from "@/lib/shell-quote";

/** Fetch the complete installer before running it; preserve either failure status. */
export function bootstrapCommand(url: string): string {
  const script = 'script=$(curl -fsSL "$1") && sh -c "$script"';
  return `sh -c ${shellQuote(script)} sh ${shellQuote(url)}`;
}
