import { shellQuote } from "@/lib/shell-quote";

/** Fetch and check the installer before running it; preserve either failure status. */
export function bootstrapCommand(url: string): string {
  const script = [
    'script=$(curl -fsSL "$1") || exit "$?"',
    // Keep the newline through command substitution so the shebang must match exactly.
    'header=$(printf "#!/bin/sh\\nx")',
    "header=${header%x}",
    'case "$script" in "$header"*) sh -c "$script" ;; *) printf "%s\\n" "Unexpected installer response: expected #!/bin/sh on the first line." >&2; exit 1 ;; esac',
  ].join("; ");
  return `sh -c ${shellQuote(script)} sh ${shellQuote(url)}`;
}
