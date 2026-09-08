import type { NextRequest } from "next/server";
import { setupScript } from "@/lib/setup-script";
import { getSetupOrigin } from "@/lib/setup-origin";

export const GET: (request: NextRequest) => Response = () => {
  const origin = getSetupOrigin();
  if (!origin) {
    return new Response(
      "#!/bin/sh\n# The devx installer URL is not configured. Use the manual setup steps.\nexit 1\n",
      {
        status: 503,
        headers: {
          "Content-Type": "text/x-shellscript; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }
  let script: string;
  try {
    script = setupScript(origin);
  } catch {
    // Preserve a shell-safe error for direct consumers of this endpoint.
    // The site's bootstrap command stops on the HTTP error before execution.
    return new Response(
      "#!/bin/sh\n# The devx installer is temporarily unavailable.\n" +
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
};
