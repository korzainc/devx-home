import { shellQuote } from "@/lib/shell-quote";

/** Fetch the complete installer; validate remote responses before execution. */
export function bootstrapCommand(url: string): string {
  const target = new URL(url);
  const localDevelopment =
    process.env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname);
  if (localDevelopment) {
    // Trust the local development server, but never follow it to a remote host.
    // Buffer the download so failures cannot execute a partial installer.
    const script = 's=$(curl -fsSL --max-redirs 0 "$1") && sh -c "$s"';
    return `sh -c ${shellQuote(script)} sh ${shellQuote(url)}`;
  }

  // Keep POSIX syntax inside sh, regardless of the user's interactive shell.
  // The sentinel preserves the newline so only an exact shebang line is accepted.
  const script =
    's=$(curl -fsSL "$1") && h=$(printf "#!/bin/sh\\nx") && ' +
    'case $s in "${h%x}"*) sh -c "$s";; ' +
    '*) echo "korza: unexpected installer response" >&2; exit 1;; esac';
  return `sh -c ${shellQuote(script)} sh ${shellQuote(url)}`;
}
