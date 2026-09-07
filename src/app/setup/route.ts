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
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : request.nextUrl.origin;
}

// No "use cache": the script is pinned to the requesting deployment's own
// origin (this preview's URL, not a fixed one), so it has to run per request.
// Under Cache Components that is the default for a GET route handler that
// reads request-time data, and the "dynamic" route-segment export this
// replaced is not compatible with Cache Components.
export function GET(request: NextRequest) {
  const script = setupScript(resolveOrigin(request));
  return new Response(script, {
    headers: {
      "Content-Type": "text/x-shellscript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
