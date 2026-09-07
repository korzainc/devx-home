import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // `next dev` blocks cross-origin requests to its own JS/asset endpoints by
  // default. Without this, tunneling the dev server (ngrok, etc.) loads the
  // page's initial HTML fine but the client JS bundle is refused, so nothing
  // ever hydrates: every client component is stuck showing its server
  // fallback forever. Real Vercel previews are unaffected, this only matters
  // for `next dev`.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok.io", "*.ngrok.app"],
};

export default nextConfig;
