import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

// Serves every Better Auth endpoint, including the GitHub callback registered on the App as
// /api/auth/callback/github.
//
// Wrapped per request rather than destructured at module scope, so importing this route during
// the build does not construct the auth instance.
export function GET(request: Request) {
  return toNextJsHandler(getAuth()).GET(request);
}

export function POST(request: Request) {
  return toNextJsHandler(getAuth()).POST(request);
}
