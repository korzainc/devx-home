import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

// Serves every Better Auth endpoint, including the GitHub callback registered on the App as
// /api/auth/callback/github.
export const { GET, POST } = toNextJsHandler(auth);
