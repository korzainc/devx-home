import type { NextConfig } from "next";
import { getSetupOrigin } from "./src/lib/setup-origin";

const setupOrigin = getSetupOrigin();

const nextConfig: NextConfig = {
  cacheComponents: true,
  async redirects() {
    return [
      {
        source: "/devx/install.sh",
        destination: "/setup",
        permanent: false,
      },
      {
        source: "/devx/devx-0.1.0-macos.tar.gz",
        destination: "/korza/korza-0.1.0-macos.tar.gz",
        permanent: false,
      },
      {
        source: "/devx/devx-0.1.0-macos.tar.gz.sha256",
        destination: "/korza/korza-0.1.0-macos.tar.gz.sha256",
        permanent: false,
      },
    ];
  },
  // Permit the explicitly configured development origin, including a local tunnel.
  allowedDevOrigins: setupOrigin ? [new URL(setupOrigin).hostname] : [],
};

export default nextConfig;
