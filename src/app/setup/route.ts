import type { NextRequest } from "next/server";
import { setupScript } from "@/lib/setup-script";

// No "use cache": the script is pinned to the requesting deployment's own
// origin (this preview's URL, not a fixed one), so it has to run per request.
// Under Cache Components that is the default for a GET route handler that
// reads request-time data, and the "dynamic" route-segment export this
// replaced is not compatible with Cache Components.
export function GET(request: NextRequest) {
  const script = setupScript(request.nextUrl.origin);
  return new Response(script, {
    headers: {
      "Content-Type": "text/x-shellscript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
