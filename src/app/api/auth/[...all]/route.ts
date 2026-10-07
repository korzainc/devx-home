import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth";

// The bearer plugin's after-hook stamps a raw, unsigned session token onto every response that
// sets the session cookie, including the ordinary GitHub OAuth browser callback - so any
// same-origin script could read a portable credential via fetch for a login that never touches
// the CLI. Only /device/token needs it; it's also returned there in the JSON body, so even that
// path doesn't depend on the header.
const DEVICE_TOKEN_PATH = "/api/auth/device/token";

function stripBearerTokenHeader(response: Response, pathname: string): Response {
  if (pathname === DEVICE_TOKEN_PATH || !response.headers.has("set-auth-token")) {
    return response;
  }
  response.headers.delete("set-auth-token");
  const exposed = response.headers.get("access-control-expose-headers");
  if (exposed) {
    const remaining = exposed
      .split(",")
      .map((header) => header.trim())
      .filter((header) => header && header.toLowerCase() !== "set-auth-token");
    if (remaining.length > 0) {
      response.headers.set("Access-Control-Expose-Headers", remaining.join(", "));
    } else {
      response.headers.delete("access-control-expose-headers");
    }
  }
  return response;
}

// Serves every Better Auth endpoint, including the GitHub callback registered on the App as
// /api/auth/callback/github.
//
// Wrapped per request rather than destructured at module scope, so importing this route during
// the build does not construct the auth instance.
export async function GET(request: Request) {
  const response = await toNextJsHandler(getAuth()).GET(request);
  return stripBearerTokenHeader(response, new URL(request.url).pathname);
}

export async function POST(request: Request) {
  const response = await toNextJsHandler(getAuth()).POST(request);
  return stripBearerTokenHeader(response, new URL(request.url).pathname);
}
