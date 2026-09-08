import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Allow client assets when next dev is reached through an ngrok tunnel.
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok.io", "*.ngrok.app"],
};

export default nextConfig;
