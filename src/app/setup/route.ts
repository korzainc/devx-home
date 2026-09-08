import type { NextRequest } from "next/server";
import { setupScript } from "@/lib/setup-script";

// request.nextUrl.origin does not reliably reflect the public-facing origin
// behind a reverse proxy: it reported "https://localhost:3000" through an
// ngrok tunnel even though the tunnel's own x-forwarded-host and
// x-forwarded-proto were present and correct on the request. Those are the
// same headers Vercel's edge network sets, so this would misfire on a real
// preview too, silently pointing every install command at localhost. Read
// the forwarded headers directly instead of trusting nextUrl.
function resolveOrigin(request: NextRequest): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  // Fall back to the request's own scheme rather than assuming https: an
  // unproxied `next dev` server sends a host header but no
  // x-forwarded-proto, so hardcoding https there hands local rehearsal a
  // DEVX_DIST_URL that the script's own curl cannot reach over plain http.
  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "");
  return host ? `${proto}://${host}` : request.nextUrl.origin;
}

// No "use cache": the script is pinned to the requesting deployment's own
// origin (this preview's URL, not a fixed one), so it has to run per request.
// Under Cache Components that is the default for a GET route handler that
// reads request-time data, and the "dynamic" route-segment export this
// replaced is not compatible with Cache Components.
export function GET(request: NextRequest) {
  let script: string;
  try {
    script = setupScript(resolveOrigin(request));
  } catch {
    // This body is piped straight into sh, so Next's HTML error page would
    // reach the user as a run of shell syntax errors. Answer with something a
    // shell can actually execute: a comment and a non-zero exit.
    return new Response(
      "# The devx installer is temporarily unavailable.\n" +
        "# Nothing was installed. Please report this in #devx.\n" +
        "exit 1\n",
      {
        status: 500,
        headers: {
          "Content-Type": "text/x-shellscript; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }
  return new Response(script, {
    headers: {
      "Content-Type": "text/x-shellscript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
