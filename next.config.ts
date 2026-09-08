import type { NextConfig } from "next";
import { getSetupOrigin } from "./src/lib/setup-origin";

const setupOrigin = getSetupOrigin();

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Permit the explicitly configured development origin, including a local tunnel.
  allowedDevOrigins: setupOrigin ? [new URL(setupOrigin).hostname] : [],
};

export default nextConfig;
