import type { NextRequest } from "next/server";
import { setupScript } from "@/lib/setup-script";

// Forwarded headers preserve the public origin behind a proxy. The deployment
// must replace client-supplied values before forwarding the request.
function resolveOrigin(request: NextRequest): string {
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  // Preserve HTTP when reaching an unproxied local dev server.
  const proto =
    request.headers.get("x-forwarded-proto") ??
    request.nextUrl.protocol.replace(":", "");
  return host ? `${proto}://${host}` : request.nextUrl.origin;
}

// Reading request headers keeps this handler dynamic under Cache Components.
export function GET(request: NextRequest) {
  let script: string;
  try {
    script = setupScript(resolveOrigin(request));
  } catch {
    // Preserve a shell-safe error for direct consumers of this endpoint.
    // The site's bootstrap command stops on the HTTP error before execution.
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
