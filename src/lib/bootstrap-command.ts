import { shellQuote } from "@/lib/shell-quote";

/** Fetch and check the installer before running it; preserve either failure status. */
export function bootstrapCommand(url: string): string {
  // Keep POSIX syntax inside sh, regardless of the user's interactive shell.
  // The sentinel preserves the newline so only an exact shebang line is accepted.
  const script =
    's=$(curl -fsSL "$1") && h=$(printf "#!/bin/sh\\nx") && ' +
    'case $s in "${h%x}"*) sh -c "$s";; ' +
    '*) echo "devx: unexpected installer response" >&2; exit 1;; esac';
  return `sh -c ${shellQuote(script)} sh ${shellQuote(url)}`;
}
